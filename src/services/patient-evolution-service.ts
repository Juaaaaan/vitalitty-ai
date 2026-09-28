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
