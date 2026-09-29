import type { SupabaseClient } from "@supabase/supabase-js";
import { CLINICAL_FIELD_LABELS } from "@/constants/patient-memory";
import { PORTION_GROUP_LABELS } from "@/constants/diet-comparison";
import {
  ToolInputError,
  ToolNotFoundError,
  type AssistantToolContext,
} from "@/models/assistant/assistant.models";
import { getAppointmentsInRange } from "@/services/calendar-service";
import { loadComparison } from "@/services/diet-comparison-store";
import { loadPatientMemory } from "@/services/patient-context-service";
import {
  DIETS_LIMIT,
  FULL_DOCUMENT_LIMIT,
  SEARCH_LIMIT,
  parseCompare,
  parseCriterion,
  parseDiets,
  parsePatient,
  parseSearchPatient,
  type CriterionInput,
} from "@/services/assistant/catalog";

/**
 * Ejecutores de las herramientas de LECTURA del asistente.
 *
 * Aquí no hay ninguna escritura, y es deliberado: el bucle del agente solo
 * importa este módulo, así que una herramienta que escriba no puede colarse en
 * él ni por descuido ni por un nombre mal escrito.
 *
 * Ninguna consulta filtra por usuario a mano: lo hace la RLS. Un identificador
 * de otro usuario devuelve vacío, que se traduce a "no encontrado" sin revelar
 * si existe.
 */

const toNumber = (value: number | string | null | undefined) =>
  value == null ? null : Number(value);

/** Escapa los comodines de `ilike` para que el texto se busque literal. */
const escapeLike = (text: string) => text.replace(/[%_\\]/g, "\\$&");

async function requirePatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ id: string; name_surnames: string }> {
  const { data } = await supabase
    .from("patients")
    .select("id, name_surnames")
    .eq("id", patientId)
    .maybeSingle();

  if (!data) throw new ToolNotFoundError();

  return data as { id: string; name_surnames: string };
}

async function buscarPaciente(ctx: AssistantToolContext, input: unknown) {
  const { texto } = parseSearchPatient(input);
  const pattern = `%${escapeLike(texto)}%`;

  const { data, error } = await ctx.supabase
    .from("patients")
    .select("id, name_surnames, mail, phone")
    .or(`name_surnames.ilike.${pattern},mail.ilike.${pattern}`)
    .order("name_surnames", { ascending: true })
    .limit(SEARCH_LIMIT);

  if (error) throw new Error(error.message);

  return {
    pacientes: (data ?? []).map((patient) => ({
      id: patient.id,
      nombre: patient.name_surnames,
      correo: patient.mail ?? null,
      telefono: patient.phone ?? null,
    })),
  };
}

async function getPaciente(ctx: AssistantToolContext, input: unknown) {
  const { pacienteId } = parsePatient(input);
  const memory = await loadPatientMemory(ctx.supabase, pacienteId);

  if (!memory) throw new ToolNotFoundError();

  // `lastDietMd` se descarta a propósito: la ficha no devuelve documentos de
  // dieta, para eso está get_dietas. Volcar aquí una dieta entera llenaría el
  // contexto en la primera pregunta.
  const clinica: Record<string, unknown> = {};
  for (const [field, label] of CLINICAL_FIELD_LABELS) {
    const value = memory.clinical[field];
    if (value != null) clinica[label] = value;
  }

  return {
    paciente: memory.personal,
    clinica,
    consultas_recientes: memory.summaries.map((summary) => ({
      version: summary.version,
      fecha: summary.date,
      resumen: summary.summary,
    })),
  };
}

async function getDietas(ctx: AssistantToolContext, input: unknown) {
  const { pacienteId, n } = parseDiets(input);
  await requirePatient(ctx.supabase, pacienteId);

  const { data, error } = await ctx.supabase
    .from("patient_consultations")
    .select(
      "id, diet_version, created_at, objetivo_calorias, pdf_path, diet_md",
    )
    .eq("patient_id", pacienteId)
    .not("diet_md", "is", null)
    .order("diet_version", { ascending: false })
    .limit(Math.min(n, DIETS_LIMIT));

  if (error) throw new Error(error.message);

  // El documento entero solo cuando se piden pocas versiones: pedir diez y
  // recibir diez dietas completas llenaría el contexto de la conversación.
  const withDocument = n <= FULL_DOCUMENT_LIMIT;

  return {
    dietas: (data ?? []).map((row) => ({
      consulta_id: row.id,
      version: row.diet_version,
      fecha: (row.created_at as string).slice(0, 10),
      calorias: row.objetivo_calorias ?? null,
      tiene_pdf: row.pdf_path != null,
      ...(withDocument ? { documento: row.diet_md } : {}),
    })),
  };
}

async function compararDietas(ctx: AssistantToolContext, input: unknown) {
  const { pacienteId, versionA, versionB } = parseCompare(input);
  await requirePatient(ctx.supabase, pacienteId);

  const newer = Math.max(versionA, versionB);
  const older = Math.min(versionA, versionB);

  const { data } = await ctx.supabase
    .from("patient_consultations")
    .select("id, diet_version")
    .eq("patient_id", pacienteId)
    .in("diet_version", [older, newer])
    .not("diet_md", "is", null);

  const rows = (data ?? []) as Array<{ id: string; diet_version: number }>;
  const current = rows.find((row) => row.diet_version === newer);

  if (!current) {
    throw new ToolInputError(
      `Ese paciente no tiene una dieta v${newer}. Consulta sus versiones con get_dietas.`,
    );
  }

  const result = await loadComparison(ctx.supabase, current.id);

  if (!result.ok) {
    throw new ToolInputError(
      result.failure === "first_diet"
        ? `La v${newer} es la primera dieta de ese paciente: no hay versión anterior con la que compararla.`
        : "No se encuentra esa dieta.",
    );
  }

  const { comparison } = result;
  // La comparación es siempre contra la versión anterior existente. Si no es la
  // que pedía el usuario, se dice, en vez de responder otra cosa en silencio.
  const comparedAgainst = comparison.previous.dietVersion;

  return {
    aviso:
      comparedAgainst === older
        ? undefined
        : `Solo se comparan versiones consecutivas: se compara la v${newer} con la v${comparedAgainst}, que es la anterior existente.`,
    anterior: comparison.previous,
    actual: comparison.current,
    raciones: comparison.portions.map((diff) => ({
      grupo: PORTION_GROUP_LABELS[diff.group],
      ...diff,
    })),
    alimentos_que_entran: comparison.added,
    alimentos_que_salen: comparison.removed,
    resumen: comparison.summary,
  };
}

async function estadisticasPaciente(ctx: AssistantToolContext, input: unknown) {
  const { pacienteId } = parsePatient(input);
  await requirePatient(ctx.supabase, pacienteId);

  const { data, error } = await ctx.supabase
    .from("patient_consultations")
    .select(
      "id, created_at, diet_version, objetivo_calorias, weight, diet_portions",
    )
    .eq("patient_id", pacienteId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    created_at: string;
    diet_version: number | null;
    objetivo_calorias: number | null;
    weight: number | string | null;
    diet_portions: { groups: Array<Record<string, unknown>> } | null;
  }>;

  // Las raciones solo se leen de lo ya proyectado. Proyectar las que faltan
  // llama al modelo por cada dieta, y esto corre dentro del bucle del agente:
  // lo hace la ficha del paciente, que sí puede permitírselo.
  const sinRaciones = rows.filter(
    (row) => row.diet_version != null && row.diet_portions == null,
  ).length;

  return {
    puntos: rows.map((row) => ({
      consulta_id: row.id,
      fecha: row.created_at.slice(0, 10),
      version: row.diet_version,
      calorias: row.objetivo_calorias ?? null,
      peso: toNumber(row.weight),
      raciones:
        row.diet_portions?.groups?.map((entry) => ({
          grupo:
            PORTION_GROUP_LABELS[
              entry.group as keyof typeof PORTION_GROUP_LABELS
            ],
          min: entry.min,
          max: entry.max,
          unidad: entry.unit,
        })) ?? null,
    })),
    ...(sinRaciones > 0
      ? {
          aviso: `${sinRaciones} dieta(s) aún no tienen las raciones calculadas: se ven al abrir la ficha del paciente.`,
        }
      : {}),
  };
}

async function citasEnRango(
  ctx: AssistantToolContext,
  criterion: CriterionInput,
) {
  const appointments = await getAppointmentsInRange(ctx.supabase, {
    from: criterion.from as Date,
    to: criterion.to as Date,
    types: criterion.tipos as never,
  });

  return {
    pacientes: appointments.map((appointment) => ({
      paciente_id: appointment.patient_id,
      nombre: appointment.patients?.name_surnames ?? null,
      cita: appointment.start_time,
      tipo: appointment.type,
      estado: appointment.status,
    })),
  };
}

async function sinConsultaDesde(
  ctx: AssistantToolContext,
  criterion: CriterionInput,
) {
  const { data, error } = await ctx.supabase
    .from("patients")
    .select("id, name_surnames, patient_consultations(created_at)")
    .order("name_surnames", { ascending: true });

  if (error) throw new Error(error.message);

  const since = (criterion.from as Date).getTime();

  const rows = (data ?? []) as Array<{
    id: string;
    name_surnames: string;
    patient_consultations: Array<{ created_at: string }>;
  }>;

  return {
    pacientes: rows
      .map((patient) => {
        const last = (patient.patient_consultations ?? [])
          .map((consultation) => consultation.created_at)
          .sort()
          .at(-1);
        return { patient, last };
      })
      // Un paciente sin ninguna consulta también lleva sin venir desde esa fecha.
      .filter(({ last }) => last == null || new Date(last).getTime() < since)
      .map(({ patient, last }) => ({
        paciente_id: patient.id,
        nombre: patient.name_surnames,
        ultima_consulta: last ? last.slice(0, 10) : null,
      })),
  };
}

async function sinDieta(ctx: AssistantToolContext) {
  const { data, error } = await ctx.supabase
    .from("patients")
    .select("id, name_surnames, patient_consultations(diet_md)")
    .order("name_surnames", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    name_surnames: string;
    patient_consultations: Array<{ diet_md: string | null }>;
  }>;

  return {
    pacientes: rows
      .filter((patient) =>
        (patient.patient_consultations ?? []).every(
          (consultation) => consultation.diet_md == null,
        ),
      )
      .map((patient) => ({
        paciente_id: patient.id,
        nombre: patient.name_surnames,
      })),
  };
}

async function pacientesPorCriterio(ctx: AssistantToolContext, input: unknown) {
  const criterion = parseCriterion(input);

  if (criterion.criterio === "citas_en_rango") {
    return citasEnRango(ctx, criterion);
  }
  if (criterion.criterio === "sin_consulta_desde") {
    return sinConsultaDesde(ctx, criterion);
  }
  return sinDieta(ctx);
}

export type ReadToolExecutor = (
  ctx: AssistantToolContext,
  input: unknown,
) => Promise<unknown>;

/** Solo herramientas de lectura: el bucle no puede despachar otra cosa. */
export const READ_TOOLS: Record<string, ReadToolExecutor> = {
  buscar_paciente: buscarPaciente,
  get_paciente: getPaciente,
  get_dietas: getDietas,
  comparar_dietas: compararDietas,
  estadisticas_paciente: estadisticasPaciente,
  pacientes_por_criterio: pacientesPorCriterio,
};
