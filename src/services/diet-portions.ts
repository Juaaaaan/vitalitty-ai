import {
  DIET_PORTIONS_VERSION,
  PORTION_GROUPS,
  PORTION_GROUP_LABELS,
} from "@/constants/diet-comparison";
import type {
  DietPortions,
  PortionDelta,
  PortionEntry,
  PortionGroup,
} from "@/models/diet-comparison/diet-comparison.models";

/**
 * Funciones puras sobre las raciones. Sin red ni SDK: las usan tanto las rutas
 * como los componentes de cliente.
 */

export const GROUP_IDS = PORTION_GROUPS.map(([group]) => group);

/**
 * Deja una sola entrada por grupo (la primera), con `min <= max` y cantidades
 * positivas. Lo que no cumple se descarta en vez de corregirse a ojo.
 */
export function normalizePortions(raw: unknown): DietPortions {
  const groups = (raw as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) {
    throw new Error("Proyección de raciones inválida");
  }

  const seen = new Set<PortionGroup>();
  const entries: PortionEntry[] = [];
  for (const item of groups as PortionEntry[]) {
    if (!GROUP_IDS.includes(item?.group) || seen.has(item.group)) continue;
    const min = Math.min(item.min, item.max);
    const max = Math.max(item.min, item.max);
    if (!Number.isFinite(min) || min <= 0) continue;
    seen.add(item.group);
    entries.push({
      group: item.group,
      label: item.label?.trim() || PORTION_GROUP_LABELS[item.group],
      min,
      max,
      unit: item.unit,
      alternatives: item.alternatives?.trim() ?? "",
    });
  }

  entries.sort(
    (a, b) => GROUP_IDS.indexOf(a.group) - GROUP_IDS.indexOf(b.group),
  );
  return { version: DIET_PORTIONS_VERSION, groups: entries };
}

/** Si una fila necesita (re)proyectar sus raciones. */
export function needsPortions(portions: DietPortions | null | undefined) {
  return !portions || (portions.version ?? 0) < DIET_PORTIONS_VERSION;
}

/**
 * Diferencia de raciones por grupo, en el orden fijo de los grupos. Pura.
 * Sin Δ cuando falta un lado o las unidades no coinciden: no se compara lo
 * que no es comparable.
 */
export function diffPortions(
  previous: DietPortions | null,
  current: DietPortions | null,
): PortionDelta[] {
  const byGroup = (portions: DietPortions | null) =>
    new Map((portions?.groups ?? []).map((entry) => [entry.group, entry]));
  const before = byGroup(previous);
  const after = byGroup(current);

  return GROUP_IDS.filter((group) => before.has(group) || after.has(group)).map(
    (group) => {
      const prev = before.get(group) ?? null;
      const curr = after.get(group) ?? null;
      const comparable = prev && curr && prev.unit === curr.unit;
      return {
        group,
        label: curr?.label ?? prev?.label ?? PORTION_GROUP_LABELS[group],
        previous: prev,
        current: curr,
        delta: comparable
          ? { min: curr.min - prev.min, max: curr.max - prev.max }
          : null,
      };
    },
  );
}
