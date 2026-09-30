"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_TYPE_LABELS } from "@/models/calendar/appointment.model";
import type { Appointment } from "@/models/calendar/appointment.model";

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
  // appointments is expected to be pre-filtered for today's date by the parent component
  const todayLabel = format(today, "d 'de' MMM", { locale: es });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Hoy, {todayLabel}</h3>
        <Badge className="text-xs font-bold uppercase bg-primary text-primary-foreground">
          {appointments.length} CITAS
        </Badge>
      </div>

      {appointments.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground">No hay citas para hoy</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {appointments.map((appt) => {
            const name =
              appt.patient_id === null
                ? "Bloqueo Personal"
                : (appt.patients?.name_surnames ?? "Paciente");
            const timeStart = format(new Date(appt.start_time), "HH:mm");
            const timeEnd = format(new Date(appt.end_time), "HH:mm");

            return (
              <li key={appt.id} className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  {appt.patients?.avatar_url && (
                    <AvatarImage src={appt.patients.avatar_url} alt={name} />
                  )}
                  <AvatarFallback className="text-xs font-semibold">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {timeStart} - {timeEnd}
                  </p>
                  <Badge
                    variant="outline"
                    className="text-xs mt-1 uppercase tracking-wide"
                  >
                    {APPOINTMENT_TYPE_LABELS[appt.type]}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href="#"
        className="text-xs text-primary hover:underline mt-1 self-start font-medium"
      >
        Ver agenda completa →
      </a>
    </div>
  );
}
