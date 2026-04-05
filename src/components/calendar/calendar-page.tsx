"use client";

import { useState, useMemo } from "react";
import { addMonths, subMonths, isSameDay } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarHeader } from "./calendar-header";
import { CalendarGrid } from "./calendar-grid";
import { CalendarSidePanel } from "./calendar-side-panel";
import type {
  Appointment,
  WeeklySummary,
} from "@/models/calendar/appointment.model";
import { APPOINTMENT_TYPE_LABELS } from "@/models/calendar/appointment.model";

interface CalendarPageClientProps {
  appointments: Appointment[];
  weeklySummary: WeeklySummary;
}

export function CalendarPageClient({
  appointments,
  weeklySummary,
}: CalendarPageClientProps) {
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewAppointmentDialog, setShowNewAppointmentDialog] =
    useState(false);

  const filteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return appointments;
    const q = searchQuery.toLowerCase();
    return appointments.filter((a) => {
      const nameMatch =
        a.patients?.name_surnames?.toLowerCase().includes(q) ?? false;
      const typeMatch = APPOINTMENT_TYPE_LABELS[a.type]
        .toLowerCase()
        .includes(q);
      return nameMatch || typeMatch;
    });
  }, [appointments, searchQuery]);

  const todayAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.start_time), today)),
    [appointments, today],
  );

  function handlePrev() {
    setCurrentMonth((m) => subMonths(m, 1));
  }

  function handleNext() {
    setCurrentMonth((m) => addMonths(m, 1));
  }

  function handleToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div className="min-h-screen p-6 bg-background">
      <CalendarHeader
        currentMonth={currentMonth}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onSearch={setSearchQuery}
        onNewAppointment={() => setShowNewAppointmentDialog(true)}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CalendarGrid
          month={currentMonth}
          appointments={filteredAppointments}
          today={today}
        />
        <CalendarSidePanel
          appointments={todayAppointments}
          today={today}
          weeklySummary={weeklySummary}
        />
      </div>

      <Dialog
        open={showNewAppointmentDialog}
        onOpenChange={setShowNewAppointmentDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Cita</DialogTitle>
          </DialogHeader>
          {/* TODO: Implement new appointment form */}
          <p className="text-sm text-muted-foreground">
            Formulario de nueva cita (próximamente).
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
