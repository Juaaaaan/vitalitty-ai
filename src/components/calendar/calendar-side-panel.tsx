"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CalendarTodayAppointments } from "./calendar-today-appointments";
import { CalendarWeeklySummary } from "./calendar-weekly-summary";
import type {
  Appointment,
  WeeklySummary,
} from "@/models/calendar/appointment.model";

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
    <Card className="h-fit">
      <CardContent className="flex flex-col gap-4 px-4 py-4">
        <CalendarTodayAppointments appointments={appointments} today={today} />
        <Separator />
        <CalendarWeeklySummary
          completed={weeklySummary.completed}
          total={weeklySummary.total}
          message={weeklySummary.message}
        />
      </CardContent>
    </Card>
  );
}
