import { PORTION_GROUP_LABELS } from "@/constants/diet-comparison";
import type {
  DietPortions,
  PortionEntry,
  PortionGroup,
  PortionUnit,
} from "@/models/diet-comparison/diet-comparison.models";
import { GROUP_IDS } from "@/services/diet-portions";

export interface EvolutionSource {
  created_at: string;
  objetivo_calorias?: number | null;
  weight?: number | null;
}

export interface EvolutionPoint {
  label: string;
  calorias: number | null;
  peso: number | null;
}

const formatShortDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * Un punto por consulta con calorías objetivo o peso, en orden cronológico.
 *
 * El número de consulta es su posición en el historial completo, no entre las
 * que tienen datos, para que coincida con el del listado de consultas. Un valor
 * ausente queda en null: la gráfica no lo pinta y no se inventa.
 */
export function buildEvolutionData(
  consultations: EvolutionSource[],
): EvolutionPoint[] {
  return [...consultations]
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    .map((consultation, index) => ({
      label: `C${index + 1} · ${formatShortDate(consultation.created_at)}`,
      calorias: consultation.objetivo_calorias ?? null,
      peso: consultation.weight ?? null,
    }))
    .filter((point) => point.calorias != null || point.peso != null);
}

export interface PortionsSource {
  dietVersion: number;
  createdAt: string;
  portions: DietPortions;
}

export interface PortionsSeriesLine {
  /** Clave de la línea y del punto: `grupo__unidad`. */
  key: string;
  group: PortionGroup;
  label: string;
  unit: PortionUnit;
}

export interface PortionsSeries {
  /** Un punto por dieta: `{ label, [clave]: centro del rango }`. */
  points: Array<Record<string, string | number>>;
  /** Una línea por grupo y unidad, en el orden fijo de los grupos. */
  lines: PortionsSeriesLine[];
  /** Entrada original por punto y clave, para mostrar el rango en el detalle. */
  entries: Array<Record<string, PortionEntry>>;
}

const lineKey = (entry: PortionEntry) => `${entry.group}__${entry.unit}`;

/**
 * Serie de raciones, un punto por dieta en orden de versión.
 *
 * Una línea por grupo **y unidad**: si una dieta pauta el pan en piezas y otra
 * en gramos, son dos líneas, porque unir esos puntos compararía lo que no es
 * comparable. El punto de un rango es su centro; el rango completo se conserva
 * en `entries`. Un grupo que una dieta no pauta no tiene punto.
 */
export function buildPortionsSeries(rows: PortionsSource[]): PortionsSeries {
  const sorted = [...rows].sort((a, b) => a.dietVersion - b.dietVersion);
  const present = new Map<string, PortionEntry>();

  const entries = sorted.map((row) =>
    Object.fromEntries(
      row.portions.groups.map((entry) => {
        const key = lineKey(entry);
        if (!present.has(key)) present.set(key, entry);
        return [key, entry];
      }),
    ),
  );

  const points = sorted.map((row, index) => {
    const point: Record<string, string | number> = {
      label: `v${row.dietVersion} · ${formatShortDate(row.createdAt)}`,
    };
    for (const [key, entry] of Object.entries(entries[index])) {
      point[key] = (entry.min + entry.max) / 2;
    }
    return point;
  });

  const lines = [...present.entries()]
    .map(([key, entry]) => ({
      key,
      group: entry.group,
      label: PORTION_GROUP_LABELS[entry.group],
      unit: entry.unit,
    }))
    .sort(
      (a, b) =>
        GROUP_IDS.indexOf(a.group) - GROUP_IDS.indexOf(b.group) ||
        a.unit.localeCompare(b.unit),
    );

  return { points, lines, entries };
}
