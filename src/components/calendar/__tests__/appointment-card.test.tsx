import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppointmentCard } from "@/components/calendar/appointment-card";
import type { CalendarEvent } from "@/models/calendar.model";

const mockAppointment: CalendarEvent = {
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
  notes: "Paciente con historial de diabetes",
  startDateTime: new Date("2026-04-05T09:00:00"),
  endDateTime: new Date("2026-04-05T10:00:00"),
};

describe("AppointmentCard", () => {
  it("should render appointment title and patient name", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText("Consulta inicial - Nutrición")).toBeInTheDocument();
    expect(screen.getByText("María García López")).toBeInTheDocument();
  });

  it("should render appointment description", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText("Primera consulta de nutrición.")).toBeInTheDocument();
  });

  it("should render time information", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText(/09:00 - 10:00/)).toBeInTheDocument();
  });

  it("should render location", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText("Consulta 1")).toBeInTheDocument();
  });

  it("should render appointment type badge", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText("Consulta")).toBeInTheDocument();
  });

  it("should render appointment status badge", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText("Confirmada")).toBeInTheDocument();
  });

  it("should render notes when present", () => {
    render(<AppointmentCard appointment={mockAppointment} />);

    expect(screen.getByText(/Paciente con historial de diabetes/)).toBeInTheDocument();
  });

  it("should not render location when it's N/A", () => {
    const appointmentWithoutLocation = {
      ...mockAppointment,
      location: "N/A",
    };

    render(<AppointmentCard appointment={appointmentWithoutLocation} />);

    expect(screen.queryByText("N/A")).not.toBeInTheDocument();
  });

  it("should render pending status badge correctly", () => {
    const pendingAppointment = {
      ...mockAppointment,
      status: "pending" as const,
    };

    render(<AppointmentCard appointment={pendingAppointment} />);

    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("should render blocked status badge correctly", () => {
    const blockedAppointment = {
      ...mockAppointment,
      type: "blocked" as const,
      status: "blocked" as const,
    };

    render(<AppointmentCard appointment={blockedAppointment} />);

    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
  });
});
