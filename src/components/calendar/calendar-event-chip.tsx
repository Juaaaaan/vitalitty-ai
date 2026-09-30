"use client";

import type { Appointment } from "@/models/calendar/appointment.model";
import {
  APPOINTMENT_COLORS,
  APPOINTMENT_TYPE_LABELS,
} from "@/models/calendar/appointment.model";
import { cn } from "@/lib/utils";

interface CalendarEventChipProps {
  appointment: Appointment;
}

export function CalendarEventChip({ appointment }: CalendarEventChipProps) {
  const colorClass = APPOINTMENT_COLORS[appointment.type];
  const label =
    appointment.patient_id === null
      ? "Bloqueo Personal"
      : `${appointment.patients?.name_surnames ?? "Paciente"} - ${APPOINTMENT_TYPE_LABELS[appointment.type]}`;

  return (
    <div
      className={cn(
        "truncate rounded px-1.5 py-0.5 text-xs leading-tight",
        colorClass,
      )}
      title={label}
    >
      {label}
    </div>
  );
}
