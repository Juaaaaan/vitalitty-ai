"use client";

import { Progress } from "@/components/ui/progress";

interface CalendarWeeklySummaryProps {
  completed: number;
  total: number;
  message: string;
}

export function CalendarWeeklySummary({
  completed,
  total,
  message,
}: CalendarWeeklySummaryProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        RESUMEN SEMANAL
      </h3>
      <div className="flex items-center justify-between text-sm">
        <span>Citas completadas</span>
        <span className="font-semibold">
          {completed}/{total}
        </span>
      </div>
      <Progress value={percentage} aria-label="Citas completadas esta semana" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
