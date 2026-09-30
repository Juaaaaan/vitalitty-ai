"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { PORTIONS_FAILED_MESSAGE } from "@/constants/diet-comparison";
import type {
  DietPortions,
  DietPortionsResponse,
} from "@/models/diet-comparison/diet-comparison.models";
import { needsPortions } from "@/services/diet-portions";
import {
  buildPortionsSeries,
  type PortionsSource,
} from "@/services/patient-evolution-service";

/** Lo que la ficha ya tiene cargado de cada consulta. */
export interface PortionsConsultation {
  id: string;
  created_at: string;
  diet_version?: number | null;
  diet_md?: string | null;
  diet_portions?: DietPortions | null;
}

// Cinco colores del tema; a partir del sexto grupo se repiten con trazo discontinuo.
const THEME_COLORS = 5;
const colorOf = (index: number) => `var(--chart-${(index % THEME_COLORS) + 1})`;
const dashOf = (index: number) => (index >= THEME_COLORS ? "5 4" : undefined);

const formatNumber = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 1 });

/**
 * Evolución de las raciones por grupo, un punto por dieta.
 *
 * Pinta al momento las raciones que la ficha ya trae y solo llama a
 * `/api/diet-portions` si falta alguna: la primera apertura de un paciente con
 * dietas antiguas las proyecta, las siguientes no hacen ninguna petición.
 */
export function PortionsChart({
  patientId,
  consultations,
}: {
  patientId: string;
  consultations: PortionsConsultation[];
}) {
  const diets = useMemo(
    () => consultations.filter((c) => c.diet_md && c.diet_version != null),
    [consultations],
  );
  const pending = diets.some((d) => needsPortions(d.diet_portions));

  const [fetched, setFetched] = useState<PortionsSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();

    fetch("/api/diet-portions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as DietPortionsResponse;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setFetched(body.portions);
        setFailed(body.failed.length > 0);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Diet portions request failed:", error);
        setFailed(true);
      });

    return () => controller.abort();
  }, [patientId, pending]);

  const series = useMemo(() => {
    const available: PortionsSource[] =
      fetched ??
      diets
        .filter((d) => !needsPortions(d.diet_portions))
        .map((d) => ({
          dietVersion: d.diet_version as number,
          createdAt: d.created_at,
          portions: d.diet_portions as DietPortions,
        }));
    return buildPortionsSeries(available);
  }, [diets, fetched]);

  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        series.lines.map(({ key, label, unit }, index) => [
          key,
          { label: `${label} (${unit})`, color: colorOf(index) },
        ]),
      ) satisfies ChartConfig,
    [series.lines],
  );

  if (diets.length === 0) return null;

  // Cargando mientras falten raciones y no haya llegado ni respuesta ni error.
  const loading = pending && fetched === null && !failed;

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
        Raciones por dieta
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Cantidad base de cada grupo en cada versión de la dieta
      </p>

      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3"
        >
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Preparando las raciones de las dietas…
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300 mb-3">
          {PORTIONS_FAILED_MESSAGE}
        </p>
      )}

      {series.points.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {series.lines.map(({ key, label, unit }, index) => (
              <button
                key={key}
                type="button"
                aria-pressed={!hidden.has(key)}
                onClick={() => toggle(key)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-600 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300 aria-[pressed=false]:opacity-40"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: colorOf(index) }}
                />
                {label} ({unit})
              </button>
            ))}
          </div>

          <ChartContainer config={chartConfig} className="max-h-[240px] w-full">
            <LineChart data={series.points} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={45}
              />
              <ChartTooltip
                content={({ active, label, payload }) => {
                  if (!active || !payload?.length) return null;
                  const index = series.points.findIndex(
                    (p) => p.label === label,
                  );
                  const entries = series.entries[index] ?? {};
                  return (
                    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="font-medium mb-1">{label}</p>
                      {payload.map((item) => {
                        const entry = entries[String(item.dataKey)];
                        if (!entry) return null;
                        const amount =
                          entry.min === entry.max
                            ? formatNumber(entry.min)
                            : `${formatNumber(entry.min)}-${formatNumber(entry.max)}`;
                        return (
                          <p key={String(item.dataKey)} className="flex gap-2">
                            <span className="text-muted-foreground">
                              {entry.label}
                            </span>
                            <span className="font-mono tabular-nums">
                              {amount} {entry.unit}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  );
                }}
              />
              {series.lines.map(({ key }, index) => (
                <Line
                  key={key}
                  dataKey={key}
                  hide={hidden.has(key)}
                  type="monotone"
                  stroke={colorOf(index)}
                  strokeDasharray={dashOf(index)}
                  strokeWidth={2}
                  dot={{ r: 3, fill: colorOf(index) }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ChartContainer>
        </>
      )}
    </div>
  );
}
