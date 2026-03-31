"use client";

import type { CalendarEvent } from "@/models/calendar.model";
import { sortAppointmentsByDateTime } from "@/services/calendar-service";
import { AppointmentCard } from "./appointment-card";

interface ListViewProps {
  appointments: CalendarEvent[];
}

export function ListView({ appointments }: ListViewProps) {
  const sortedAppointments = sortAppointmentsByDateTime(appointments);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Lista de Citas</h2>

      {sortedAppointments.length > 0 ? (
        <div className="space-y-3">
          {sortedAppointments.map((apt) => (
            <AppointmentCard key={apt.id} appointment={apt} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No hay citas programadas</p>
        </div>
      )}
    </div>
  );
}
