"use client";

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from "date-fns";
import type { Appointment } from "@/models/calendar/appointment.model";
import { CalendarEventChip } from "./calendar-event-chip";
import { cn } from "@/lib/utils";

const DAY_HEADERS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

interface CalendarGridProps {
  month: Date;
  appointments: Appointment[];
  today: Date;
}

export function CalendarGrid({
  month,
  appointments,
  today,
}: CalendarGridProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  // Week starts on Monday (weekStartsOn: 1)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {DAY_HEADERS.map((header) => (
          <div
            key={header}
            className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            {header}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, month);
          const dayAppointments = appointments.filter((a) =>
            isSameDay(new Date(a.start_time), day),
          );

          return (
            <div
              key={day.toISOString()}
              data-today={isToday ? "true" : undefined}
              className={cn(
                "min-h-[80px] border-b border-r p-1.5 last:border-r-0",
                !isCurrentMonth && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayAppointments.map((appt) => (
                  <CalendarEventChip key={appt.id} appointment={appt} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
