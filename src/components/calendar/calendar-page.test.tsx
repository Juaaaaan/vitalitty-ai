import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { CalendarEventChip } from "@/components/calendar/calendar-event-chip";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { CalendarTodayAppointments } from "@/components/calendar/calendar-today-appointments";
import { CalendarWeeklySummary } from "@/components/calendar/calendar-weekly-summary";
import type { Appointment } from "@/models/calendar/appointment.model";

// Stable "today" for all grid/today tests
const TODAY = new Date(2025, 0, 15, 0, 0, 0, 0); // Jan 15, 2025
const MONTH = new Date(2025, 0, 1); // January 2025

const mockAppointment = (
  overrides: Partial<Appointment> = {},
): Appointment => ({
  id: "test-1",
  patient_id: "p1",
  start_time: new Date(2025, 0, 15, 9, 0).toISOString(),
  end_time: new Date(2025, 0, 15, 9, 30).toISOString(),
  type: "seguimiento",
  status: "pending",
  patients: { id: "p1", name_surnames: "Ana García" },
  ...overrides,
});

// ──────────────────────────────────────────────
// CalendarGrid
// ──────────────────────────────────────────────
describe("CalendarGrid", () => {
  it("renders 7 day headers (LUN–DOM)", () => {
    render(<CalendarGrid month={MONTH} appointments={[]} today={TODAY} />);
    for (const header of ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]) {
      expect(screen.getByText(header)).toBeDefined();
    }
  });

  it("highlights today with data-today attribute", () => {
    const { container } = render(
      <CalendarGrid month={MONTH} appointments={[]} today={TODAY} />,
    );
    const todayCells = container.querySelectorAll('[data-today="true"]');
    expect(todayCells.length).toBe(1);
  });

  it("applies blue styling to today's date number", () => {
    const { container } = render(
      <CalendarGrid month={MONTH} appointments={[]} today={TODAY} />,
    );
    const todayCell = container.querySelector('[data-today="true"]');
    expect(todayCell).not.toBeNull();
    // The day number span inside today's cell should have primary bg class
    const span = todayCell!.querySelector("span");
    expect(span?.className).toContain("bg-primary");
  });
});

// ──────────────────────────────────────────────
// CalendarEventChip
// ──────────────────────────────────────────────
describe("CalendarEventChip", () => {
  it("applies the correct color class for 'urgente' type", () => {
    const appt = mockAppointment({ type: "urgente" });
    const { container } = render(<CalendarEventChip appointment={appt} />);
    const chip = container.firstChild as HTMLElement;
    expect(chip.className).toContain("bg-red-100");
  });

  it("shows 'Bloqueo Personal' when patient_id is null", () => {
    const appt = mockAppointment({ patient_id: null, type: "bloqueo" });
    render(<CalendarEventChip appointment={appt} />);
    expect(screen.getByText("Bloqueo Personal")).toBeDefined();
  });

  it("shows patient name and type label for non-bloqueo appointments", () => {
    const appt = mockAppointment({ type: "seguimiento" });
    render(<CalendarEventChip appointment={appt} />);
    expect(screen.getByText(/Ana García/)).toBeDefined();
    expect(screen.getByText(/Seguimiento/)).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// CalendarHeader
// ──────────────────────────────────────────────
describe("CalendarHeader", () => {
  const baseProps = {
    currentMonth: new Date(2026, 3, 1), // April 2026
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onSearch: vi.fn(),
    onNewAppointment: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onPrev when clicking '<' button (Mes anterior)", () => {
    render(<CalendarHeader {...baseProps} />);
    const btn = screen.getByRole("button", { name: "Mes anterior" });
    fireEvent.click(btn);
    expect(baseProps.onPrev).toHaveBeenCalledTimes(1);
  });

  it("calls onToday when clicking 'Hoy' button", () => {
    render(<CalendarHeader {...baseProps} />);
    const btn = screen.getByRole("button", { name: "Hoy" });
    fireEvent.click(btn);
    expect(baseProps.onToday).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when clicking '>' button (Mes siguiente)", () => {
    render(<CalendarHeader {...baseProps} />);
    const btn = screen.getByRole("button", { name: "Mes siguiente" });
    fireEvent.click(btn);
    expect(baseProps.onNext).toHaveBeenCalledTimes(1);
  });

  it("emits the search query on input change", () => {
    render(<CalendarHeader {...baseProps} />);
    const input = screen.getByPlaceholderText("Buscar paciente o cita...");
    fireEvent.change(input, { target: { value: "Ana" } });
    expect(baseProps.onSearch).toHaveBeenCalledWith("Ana");
  });

  it("renders the month/year title", () => {
    render(<CalendarHeader {...baseProps} />);
    expect(screen.getByText(/Abril 2026/i)).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// CalendarTodayAppointments
// ──────────────────────────────────────────────
describe("CalendarTodayAppointments", () => {
  it("shows empty state when no appointments", () => {
    render(<CalendarTodayAppointments appointments={[]} today={TODAY} />);
    expect(screen.getByText("No hay citas para hoy")).toBeDefined();
  });

  it("renders correct badge count for today's appointments", () => {
    const appts = [
      mockAppointment({ id: "a1" }),
      mockAppointment({ id: "a2" }),
    ];
    render(<CalendarTodayAppointments appointments={appts} today={TODAY} />);
    expect(screen.getByText("2 CITAS")).toBeDefined();
  });

  it("shows '0 CITAS' badge when no appointments", () => {
    render(<CalendarTodayAppointments appointments={[]} today={TODAY} />);
    expect(screen.getByText("0 CITAS")).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// CalendarWeeklySummary
// ──────────────────────────────────────────────
describe("CalendarWeeklySummary", () => {
  it("renders the progress bar with correct aria-label", () => {
    render(
      <CalendarWeeklySummary
        completed={18}
        total={24}
        message="Tu carga de trabajo está un 12% por encima de la media semanal."
      />,
    );
    const progress = screen.getByRole("progressbar", {
      name: "Citas completadas esta semana",
    });
    expect(progress).toBeDefined();
  });

  it("renders the correct completed/total text", () => {
    render(
      <CalendarWeeklySummary
        completed={18}
        total={24}
        message="Mensaje de prueba"
      />,
    );
    expect(screen.getByText("18/24")).toBeDefined();
  });

  it("renders the message text", () => {
    render(
      <CalendarWeeklySummary
        completed={18}
        total={24}
        message="Tu carga de trabajo está un 12% por encima de la media semanal."
      />,
    );
    expect(
      screen.getByText(
        "Tu carga de trabajo está un 12% por encima de la media semanal.",
      ),
    ).toBeDefined();
  });

  it("sets the progressbar aria-valuenow to the correct percentage", () => {
    render(<CalendarWeeklySummary completed={18} total={24} message="test" />);
    const progress = screen.getByRole("progressbar");
    // 18/24 = 75
    expect(progress.getAttribute("aria-valuenow")).toBe("75");
  });
});
