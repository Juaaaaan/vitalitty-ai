import { CalendarContainer } from "@/components/calendar/calendar-container";
import { convertToCalendarEvent, fetchCalendarData } from "@/services/calendar-service";

export const metadata = {
  title: "Calendario",
  description: "Visualiza tu agenda de consultas",
};

export default async function CalendarPage() {
  const appointmentData = await fetchCalendarData();
  const calendarEvents = appointmentData.map(convertToCalendarEvent);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendario</h1>
        <p className="text-gray-600 mt-2">Visualiza tu agenda de consultas y citas</p>
      </div>

      <CalendarContainer appointments={calendarEvents} />
    </div>
  );
}
