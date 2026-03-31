import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarContainer } from "@/components/calendar/calendar-container";
import type { CalendarEvent } from "@/models/calendar.model";

const mockAppointments: CalendarEvent[] = [
  {
    id: "apt-001",
    patientId: "patient-001",
    patientName: "María García López",
    type: "consultation",
    title: "Consulta inicial - Nutrición",
    description: "Primera consulta de nutrición.",
    date: "2026-04-05",
    startTime: "09:00",
    endTime: "10:00",
    location: "Consulta 1",
    status: "confirmed",
    notes: "",
    startDateTime: new Date("2026-04-05T09:00:00"),
    endDateTime: new Date("2026-04-05T10:00:00"),
  },
];

describe("CalendarContainer", () => {
  it("should render calendar tabs", () => {
    render(<CalendarContainer appointments={mockAppointments} />);

    expect(screen.getByRole("tab", { name: /mes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /semana/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /lista/i })).toBeInTheDocument();
  });

  it("should render month view by default", () => {
    render(<CalendarContainer appointments={mockAppointments} />);

    expect(screen.getByText(/Consulta inicial - Nutrición/i)).toBeInTheDocument();
  });

  it("should switch to week view when tab is clicked", () => {
    render(<CalendarContainer appointments={mockAppointments} />);

    const weekTab = screen.getByRole("tab", { name: /semana/i });
    fireEvent.click(weekTab);

    expect(screen.getByText(/Semana del/i)).toBeInTheDocument();
  });

  it("should switch to list view when tab is clicked", () => {
    render(<CalendarContainer appointments={mockAppointments} />);

    const listTab = screen.getByRole("tab", { name: /lista/i });
    fireEvent.click(listTab);

    expect(screen.getByText("Lista de Citas")).toBeInTheDocument();
  });

  it("should display appointments in calendar", () => {
    render(<CalendarContainer appointments={mockAppointments} />);

    expect(screen.getByText("Consulta inicial - Nutrición")).toBeInTheDocument();
  });

  it("should maintain active tab selection", () => {
    render(<CalendarContainer appointments={mockAppointments} />);

    const listTab = screen.getByRole("tab", { name: /lista/i });
    fireEvent.click(listTab);

    expect(listTab).toHaveAttribute("aria-selected", "true");
  });
});
