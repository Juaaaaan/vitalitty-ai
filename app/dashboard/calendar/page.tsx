import {
  getAppointmentsForMonth,
  getWeeklySummary,
} from "@/services/calendar-service";
import { CalendarPageClient } from "@/components/calendar/calendar-page";

export default async function CalendarPage() {
  const now = new Date();
  const [appointments, weeklySummary] = await Promise.all([
    getAppointmentsForMonth(now.getFullYear(), now.getMonth()),
    getWeeklySummary(),
  ]);

  return (
    <CalendarPageClient
      appointments={appointments}
      weeklySummary={weeklySummary}
    />
  );
}
