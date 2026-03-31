import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListView } from "@/components/calendar/list-view";
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
  {
    id: "apt-002",
    patientId: "patient-002",
    patientName: "Juan Martínez Ruiz",
    type: "appointment",
    title: "Seguimiento dietético",
    description: "Seguimiento de la dieta establecida.",
    date: "2026-04-08",
    startTime: "14:00",
    endTime: "15:00",
    location: "Consulta 2",
    status: "confirmed",
    notes: "",
    startDateTime: new Date("2026-04-08T14:00:00"),
    endDateTime: new Date("2026-04-08T15:00:00"),
  },
];

describe("ListView", () => {
  it("should render the list view title", () => {
    render(<ListView appointments={mockAppointments} />);

    expect(screen.getByText("Lista de Citas")).toBeInTheDocument();
  });

  it("should render all appointments", () => {
    render(<ListView appointments={mockAppointments} />);

    expect(screen.getByText("Consulta inicial - Nutrición")).toBeInTheDocument();
    expect(screen.getByText("Seguimiento dietético")).toBeInTheDocument();
  });

  it("should render empty state when no appointments", () => {
    render(<ListView appointments={[]} />);

    expect(screen.getByText("No hay citas programadas")).toBeInTheDocument();
  });

  it("should display appointments in sorted order", () => {
    const unsortedAppointments = [...mockAppointments].reverse();

    render(<ListView appointments={unsortedAppointments} />);

    const titles = screen.getAllByRole("heading", { level: 3 });
    expect(titles[0]).toHaveTextContent("Consulta inicial - Nutrición");
    expect(titles[1]).toHaveTextContent("Seguimiento dietético");
  });
});
