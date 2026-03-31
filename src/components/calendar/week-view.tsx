"use client";

import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/models/calendar.model";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppointmentCard } from "./appointment-card";

interface WeekViewProps {
  appointments: CalendarEvent[];
  currentDate: Date;
  onWeekChange: (date: Date) => void;
}

export function WeekView({ appointments, currentDate, onWeekChange }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const appointmentsByDate = appointments.reduce(
    (acc, apt) => {
      const dateKey = format(apt.startDateTime, "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(apt);
      return acc;
    },
    {} as Record<string, CalendarEvent[]>
  );

  const handlePrevWeek = () => {
    const prevWeek = addDays(currentDate, -7);
    onWeekChange(prevWeek);
  };

  const handleNextWeek = () => {
    const nextWeek = addDays(currentDate, 7);
    onWeekChange(nextWeek);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Semana del {format(weekStart, "d MMM")} al {format(weekEnd, "d MMM")}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {daysInWeek.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayAppointments = appointmentsByDate[dateKey] || [];

          return (
            <div key={dateKey} className="space-y-2">
              <div className="text-center">
                <div className="font-semibold">{format(day, "EEEE")}</div>
                <div className="text-sm text-gray-600">{format(day, "d/M")}</div>
              </div>

              <div className="space-y-2">
                {dayAppointments.length > 0 ? (
                  dayAppointments.map((apt) => (
                    <div key={apt.id} className="text-xs">
                      <AppointmentCard appointment={apt} />
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-400 p-2 text-center">Sin citas</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
