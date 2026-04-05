"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CalendarHeaderProps {
  currentMonth: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSearch: (query: string) => void;
  onNewAppointment: () => void;
}

export function CalendarHeader({
  currentMonth,
  onPrev,
  onNext,
  onToday,
  onSearch,
  onNewAppointment,
}: CalendarHeaderProps) {
  const title = format(currentMonth, "MMMM yyyy", { locale: es });

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Month title */}
      <h2 className="text-2xl font-bold capitalize">{title}</h2>

      {/* Navigation buttons */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mes anterior"
        onClick={onPrev}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onToday}>
        Hoy
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mes siguiente"
        onClick={onNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 w-56"
          placeholder="Buscar paciente o cita..."
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {/* New appointment CTA */}
      <Button aria-label="Nueva cita" onClick={onNewAppointment}>
        <CalendarDays className="mr-2 h-4 w-4" />
        Nueva Cita
      </Button>
    </div>
  );
}
