import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarPageClient } from "@/components/calendar/calendar-page";
import type {
  Appointment,
  WeeklySummary,
} from "@/models/calendar/appointment.model";

vi.mock("@/services/calendar-service", () => ({
  getAppointmentsForMonth: vi.fn().mockResolvedValue([]),
  getWeeklySummary: vi.fn().mockResolvedValue({
    completed: 18,
    total: 24,
    message: "Test message",
  }),
}));

const mockWeeklySummary: WeeklySummary = {
  completed: 18,
  total: 24,
  message: "Tu carga de trabajo está un 12% por encima de la media semanal.",
};

const mockAppointments: Appointment[] = [];

describe("Calendar Page (CalendarPageClient)", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <CalendarPageClient
        appointments={mockAppointments}
        weeklySummary={mockWeeklySummary}
      />,
    );
    expect(container).toBeDefined();
  });

  it("renders the Nueva Cita button", () => {
    render(
      <CalendarPageClient
        appointments={mockAppointments}
        weeklySummary={mockWeeklySummary}
      />,
    );
    expect(screen.getByRole("button", { name: "Nueva cita" })).toBeDefined();
  });

  it("renders the Hoy navigation button", () => {
    render(
      <CalendarPageClient
        appointments={mockAppointments}
        weeklySummary={mockWeeklySummary}
      />,
    );
    expect(screen.getByRole("button", { name: "Hoy" })).toBeDefined();
  });

  it("renders the weekly summary section", () => {
    render(
      <CalendarPageClient
        appointments={mockAppointments}
        weeklySummary={mockWeeklySummary}
      />,
    );
    expect(screen.getByText("RESUMEN SEMANAL")).toBeDefined();
  });

  it("renders the calendar grid with day headers", () => {
    render(
      <CalendarPageClient
        appointments={mockAppointments}
        weeklySummary={mockWeeklySummary}
      />,
    );
    expect(screen.getByText("LUN")).toBeDefined();
    expect(screen.getByText("DOM")).toBeDefined();
  });
});
