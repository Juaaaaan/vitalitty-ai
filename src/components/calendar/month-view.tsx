"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CalendarEvent } from "@/models/calendar.model";
import { getTypeColor } from "@/services/calendar-service";
import { eachDayOfInterval, format, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthViewProps {
  appointments: CalendarEvent[];
  currentDate: Date;
  onMonthChange: (date: Date) => void;
  onDayClick?: (date: Date) => void;
}

export function MonthView({ appointments, currentDate, onMonthChange, onDayClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getFirstDayOffset = () => {
    return monthStart.getDay();
  };

  const daysToDisplay = Array(getFirstDayOffset()).fill(null).concat(daysInMonth);

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

  const handlePrevMonth = () => {
    const prevMonth = new Date(currentDate);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    onMonthChange(prevMonth);
  };

  const handleNextMonth = () => {
    const nextMonth = new Date(currentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    onMonthChange(nextMonth);
  };

  const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{format(currentDate, "MMMM yyyy")}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayLabels.map((day) => (
          <div key={day} className="p-2 text-center font-semibold text-sm text-gray-600">
            {day}
          </div>
        ))}

        {daysToDisplay.map((day, index) => {
          const dateKey = day ? format(day, "yyyy-MM-dd") : null;
          const dayAppointments = dateKey ? appointmentsByDate[dateKey] || [] : [];
          const isCurrentMonth = day && !isNaN(day.getTime());

          return (
            <Card
              key={`${index}-${dateKey}`}
              className={`min-h-24 p-2 cursor-pointer transition-colors ${
                isCurrentMonth ? "hover:bg-gray-50" : "bg-gray-50"
              }`}
              onClick={() => day && onDayClick?.(day)}
            >
              {day && (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-700">{format(day, "d")}</div>
                  <div className="space-y-1">
                    {dayAppointments.slice(0, 2).map((apt) => (
                      <div
                        key={apt.id}
                        className={`text-xs p-1 rounded truncate ${getTypeColor(apt.type).split(" ")[0]} ${getTypeColor(apt.type).split(" ")[1]}`}
                      >
                        {apt.title}
                      </div>
                    ))}
                    {dayAppointments.length > 2 && (
                      <div className="text-xs text-gray-500 p-1">+{dayAppointments.length - 2} más</div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
