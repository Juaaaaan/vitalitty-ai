"use client";

import { format, isSameDay } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_TYPE_LABELS } from "@/models/calendar/appointment.model";
import type { Appointment } from "@/models/calendar/appointment.model";

const SPANISH_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface CalendarTodayAppointmentsProps {
  appointments: Appointment[];
  today: Date;
}

export function CalendarTodayAppointments({
  appointments,
  today,
}: CalendarTodayAppointmentsProps) {
  const todayAppointments = appointments.filter((a) =>
    isSameDay(new Date(a.start_time), today),
  );

  const day = today.getDate();
  const monthName = SPANISH_MONTHS[today.getMonth()];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          Hoy, {day} de {monthName}
        </h3>
        <Badge variant="secondary" className="text-xs font-bold uppercase">
          {todayAppointments.length} CITAS
        </Badge>
      </div>

      {todayAppointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay citas para hoy</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todayAppointments.map((appt) => {
            const name =
              appt.patient_id === null
                ? "Bloqueo Personal"
                : (appt.patients?.name_surnames ?? "Paciente");
            const timeStart = format(new Date(appt.start_time), "HH:mm");
            const timeEnd = format(new Date(appt.end_time), "HH:mm");

            return (
              <li key={appt.id} className="flex items-center gap-2">
                <Avatar className="h-8 w-8 shrink-0">
                  {appt.patients?.avatar_url && (
                    <AvatarImage src={appt.patients.avatar_url} alt={name} />
                  )}
                  <AvatarFallback className="text-xs">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {timeStart} - {timeEnd}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {APPOINTMENT_TYPE_LABELS[appt.type]}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href="#"
        className="text-xs text-primary hover:underline mt-1 self-start"
      >
        Ver agenda completa →
      </a>
    </div>
  );
}
