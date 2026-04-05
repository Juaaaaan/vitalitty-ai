"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
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
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes anterior"
          onClick={onPrev}
        >
          {"<"}
        </Button>
        <Button variant="outline" onClick={onToday}>
          Hoy
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes siguiente"
          onClick={onNext}
        >
          {">"}
        </Button>
      </div>

      {/* Month title — CSS capitalize handles the first-letter uppercasing */}
      <h2 className="flex-1 text-lg font-semibold capitalize">{title}</h2>

      {/* Search */}
      <Input
        className="w-56"
        placeholder="Buscar paciente o cita..."
        onChange={(e) => onSearch(e.target.value)}
      />

      {/* New appointment */}
      <Button aria-label="Nueva cita" onClick={onNewAppointment}>
        <CalendarDays className="mr-2 h-4 w-4" />
        Nueva Cita
      </Button>
    </div>
  );
}
