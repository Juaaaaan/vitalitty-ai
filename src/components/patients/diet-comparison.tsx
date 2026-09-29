"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, Loader2Icon, RotateCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPARISON_FAILED_MESSAGE,
  ONLY_ONE_DIET_MESSAGE,
} from "@/constants/diet-comparison";
import type {
  DietComparison as DietComparisonData,
  PortionEntry,
} from "@/models/diet-comparison/diet-comparison.models";

/** Lo que la ficha ya tiene cargado de cada consulta. */
export interface ComparableConsultation {
  id: string;
  created_at: string;
  diet_version?: number | null;
  diet_md?: string | null;
  objetivo_calorias?: number | null;
  weight?: number | string | null;
}

type Fetched =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: DietComparisonData };

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatNumber = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 1 });

const formatSigned = (value: number) =>
  value === 0
    ? "="
    : `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))}`;

const formatPortion = (entry: PortionEntry | null) =>
  !entry
    ? "—"
    : entry.min === entry.max
      ? `${formatNumber(entry.min)} ${entry.unit}`
      : `${formatNumber(entry.min)}-${formatNumber(entry.max)} ${entry.unit}`;

const toNumber = (value: number | string | null | undefined) =>
  value == null || value === "" ? null : Number(value);

interface Row {
  key: string;
  label: string;
  previous: string;
  current: string;
  delta: string;
  hint?: string;
}

function numberRow(
  key: string,
  label: string,
  unit: string,
  previous: number | null,
  current: number | null,
): Row {
  return {
    key,
    label,
    previous: previous == null ? "—" : `${formatNumber(previous)} ${unit}`,
    current: current == null ? "—" : `${formatNumber(current)} ${unit}`,
    delta:
      previous == null || current == null
        ? ""
        : `${formatSigned(current - previous)} ${unit}`,
  };
}

/**
 * Compara una dieta con la versión anterior del mismo paciente. Las
 * diferencias de calorías y peso salen de los datos que la ficha ya tiene; las
 * raciones, los alimentos y el resumen, de `POST /api/compare-diets`.
 */
export function DietComparison({
  consultations,
}: {
  consultations: ComparableConsultation[];
}) {
  // Solo consultas con dieta, por versión: la anterior de cada una es la previa.
  const diets = useMemo(
    () =>
      consultations
        .filter((c) => c.diet_md && c.diet_version != null)
        .sort((a, b) => (a.diet_version ?? 0) - (b.diet_version ?? 0)),
    [consultations],
  );
  const comparable = diets.slice(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [fetched, setFetched] = useState<Record<string, Fetched>>({});

  const currentId = selectedId ?? comparable.at(-1)?.id ?? null;
  const currentIndex = diets.findIndex((d) => d.id === currentId);
  const current = diets[currentIndex];
  const previous = diets[currentIndex - 1];
  const result = currentId ? fetched[currentId] : undefined;

  useEffect(() => {
    if (!currentId) return;
    const cached = fetched[currentId];
    if (cached && cached.status !== "error") return;

    const controller = new AbortController();
    setFetched((prev) => ({ ...prev, [currentId]: { status: "loading" } }));

    fetch("/api/compare-diets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: currentId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        const next: Fetched = response.ok
          ? { status: "ok", data: body }
          : {
              status: "error",
              message: body?.error || COMPARISON_FAILED_MESSAGE,
            };
        setFetched((prev) => ({ ...prev, [currentId]: next }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Diet comparison request failed:", error);
        setFetched((prev) => ({
          ...prev,
          [currentId]: { status: "error", message: COMPARISON_FAILED_MESSAGE },
        }));
      });

    return () => controller.abort();
    // `fetched` se lee solo para no repetir una petición ya hecha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, retry]);

  if (diets.length === 0) return null;

  const rows: Row[] =
    current && previous
      ? [
          numberRow(
            "kcal",
            "Calorías objetivo",
            "kcal",
            toNumber(previous.objetivo_calorias),
            toNumber(current.objetivo_calorias),
          ),
          numberRow(
            "peso",
            "Peso",
            "kg",
            toNumber(previous.weight),
            toNumber(current.weight),
          ),
          ...(result?.status === "ok"
            ? result.data.portions.map((p) => ({
                key: p.group,
                label: p.label,
                previous: formatPortion(p.previous),
                current: formatPortion(p.current),
                delta: !p.delta
                  ? ""
                  : p.delta.min === p.delta.max
                    ? `${formatSigned(p.delta.min)} ${p.current!.unit}`
                    : `${formatSigned(p.delta.min)} / ${formatSigned(p.delta.max)} ${p.current!.unit}`,
                hint: [p.previous?.alternatives, p.current?.alternatives]
                  .filter(Boolean)
                  .join(" · "),
              }))
            : []),
        ]
      : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Comparar dietas
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cada dieta frente a la versión anterior del paciente
          </p>
        </div>
        {comparable.length > 0 && (
          <Select
            value={currentId ?? undefined}
            onValueChange={(value) => setSelectedId(value)}
          >
            <SelectTrigger className="w-[220px]" aria-label="Dieta a comparar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...comparable].reverse().map((diet) => (
                <SelectItem key={diet.id} value={diet.id}>
                  v{diet.diet_version} · {formatDate(diet.created_at)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {comparable.length === 0 || !current || !previous ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {ONLY_ONE_DIET_MESSAGE}
        </p>
      ) : (
        <div className="space-y-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 text-left">
                <th className="font-normal py-1.5" />
                <th className="font-normal py-1.5">
                  v{previous.diet_version} · {formatDate(previous.created_at)}
                </th>
                <th className="font-normal py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <ArrowRightIcon className="h-3 w-3" />v
                    {current.diet_version} · {formatDate(current.created_at)}
                  </span>
                </th>
                <th className="font-normal py-1.5 text-right">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((row) => (
                <tr key={row.key} title={row.hint || undefined}>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">
                    {row.label}
                  </td>
                  <td className="py-1.5 text-gray-900 dark:text-white tabular-nums">
                    {row.previous}
                  </td>
                  <td className="py-1.5 text-gray-900 dark:text-white tabular-nums">
                    {row.current}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-gray-900 dark:text-white">
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(!result || result.status === "loading") && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
            >
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Preparando raciones, alimentos y resumen…
            </p>
          )}

          {result?.status === "error" && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
              <span>{result.message}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setRetry((n) => n + 1)}
              >
                <RotateCwIcon className="h-3 w-3 mr-1" />
                Reintentar
              </Button>
            </div>
          )}

          {result?.status === "ok" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FoodList title="Entran" items={result.data.added} />
                <FoodList title="Salen" items={result.data.removed} />
              </div>
              <div>
                <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Qué cambió y por qué
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                  {result.data.summary}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FoodList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Ninguno</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={item} variant="secondary" className="text-xs">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
