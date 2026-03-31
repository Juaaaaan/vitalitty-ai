import type { CalendarAppointment, CalendarEvent } from "@/models/calendar.model";

export async function fetchCalendarData(): Promise<CalendarAppointment[]> {
  try {
    const response = await fetch("/mock-calendar-data.json");
    if (!response.ok) {
      throw new Error("Failed to fetch calendar data");
    }
    const data = await response.json();
    return data.appointments;
  } catch (error) {
    console.error("Error fetching calendar data:", error);
    return [];
  }
}

export function convertToCalendarEvent(appointment: CalendarAppointment): CalendarEvent {
  const [startHours, startMinutes] = appointment.startTime.split(":").map(Number);
  const [endHours, endMinutes] = appointment.endTime.split(":").map(Number);

  const startDateTime = new Date(appointment.date);
  startDateTime.setHours(startHours, startMinutes, 0, 0);

  const endDateTime = new Date(appointment.date);
  endDateTime.setHours(endHours, endMinutes, 0, 0);

  return {
    ...appointment,
    startDateTime,
    endDateTime,
  };
}

export function getTypeColor(type: CalendarAppointment["type"]): string {
  switch (type) {
    case "consultation":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "appointment":
      return "bg-green-100 text-green-900 border-green-300";
    case "blocked":
      return "bg-gray-100 text-gray-900 border-gray-300";
    default:
      return "bg-gray-100 text-gray-900 border-gray-300";
  }
}

export function getStatusBadgeColor(status: CalendarAppointment["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "blocked":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getStatusLabel(status: CalendarAppointment["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmada";
    case "pending":
      return "Pendiente";
    case "blocked":
      return "Bloqueada";
    default:
      return "Desconocida";
  }
}

export function getTypeLabel(type: CalendarAppointment["type"]): string {
  switch (type) {
    case "consultation":
      return "Consulta";
    case "appointment":
      return "Cita";
    case "blocked":
      return "Bloqueada";
    default:
      return "Cita";
  }
}

export function filterAppointmentsByDateRange(
  appointments: CalendarEvent[],
  startDate: Date,
  endDate: Date
): CalendarEvent[] {
  return appointments.filter((apt) => apt.startDateTime >= startDate && apt.startDateTime <= endDate);
}

export function sortAppointmentsByDateTime(appointments: CalendarEvent[]): CalendarEvent[] {
  return [...appointments].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
}
