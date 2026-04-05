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
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        RESUMEN SEMANAL
      </h3>
      <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Citas completadas
          </span>
          <span className="text-2xl font-bold">
            {completed}/{total}
          </span>
        </div>
        <Progress
          value={percentage}
          aria-label="Citas completadas esta semana"
        />
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
