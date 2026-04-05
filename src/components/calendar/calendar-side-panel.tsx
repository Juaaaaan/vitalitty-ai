"use client";

import { CalendarTodayAppointments } from "./calendar-today-appointments";
import { CalendarWeeklySummary } from "./calendar-weekly-summary";
import type {
  Appointment,
  WeeklySummary,
} from "@/models/calendar/appointment.model";
import { Card, CardContent } from "@/components/ui/card";

interface CalendarSidePanelProps {
  appointments: Appointment[];
  today: Date;
  weeklySummary: WeeklySummary;
}

export function CalendarSidePanel({
  appointments,
  today,
  weeklySummary,
}: CalendarSidePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4">
          <CalendarTodayAppointments
            appointments={appointments}
            today={today}
          />
        </CardContent>
      </Card>
      <CalendarWeeklySummary
        completed={weeklySummary.completed}
        total={weeklySummary.total}
        message={weeklySummary.message}
      />
    </div>
  );
}
