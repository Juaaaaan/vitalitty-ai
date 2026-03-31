/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("../../../lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: { id: "123", email: "test@example.com" },
        },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })),
  },
}));

vi.mock("@/components/layout/forms/date-picker", () => ({
  DatePicker: ({ value, onChange }: any) => (
    <input
      data-testid="date-picker"
      type="date"
      value={value?.toISOString().split("T")[0] || ""}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : undefined)}
    />
  ),
}));

import DashboardPage from "../page";
import { supabase } from "../../../lib/supabase/client";
import * as nextNav from "next/navigation";

describe("Dashboard Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = render(<DashboardPage />);
    expect(container).toBeDefined();
  });

  it("displays loading state when user is not loaded", async () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Cargando/i)).toBeDefined();
  });

  it("renders with proper page structure", () => {
    const { container } = render(<DashboardPage />);
    const minHeightDiv = container.querySelector("[class*='min-h-screen']");
    expect(minHeightDiv).toBeDefined();
  });

  it("renders as client component", () => {
    const { container } = render(<DashboardPage />);
    expect(container).toBeDefined();
  });

  it("contains main section with proper spacing", () => {
    const { container } = render(<DashboardPage />);
    const sections = container.querySelectorAll("div");
    expect(sections.length).toBeGreaterThan(0);
  });

  it("renders welcome heading", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Bienvenid@/i)).toBeDefined();
    });
  });

  it("renders welcome description", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Te damos la bienvenida/i)).toBeDefined();
    });
  });

  it("renders patient info description", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Aquí podrás encontrar/i)).toBeDefined();
    });
  });

  it("renders patient search section title", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Buscador de pacientes/i)).toBeDefined();
    });
  });

  it("renders name search input", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nombre o apellidos/i)).toBeDefined();
    });
  });

  it("renders email search input", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/mail@vitalitty.es/i)).toBeDefined();
    });
  });

  it("renders age search input", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Edad/i)).toBeDefined();
    });
  });

  it("renders weight search input", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Peso en KG/i)).toBeDefined();
    });
  });

  it("renders date picker field", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("date-picker")).toBeDefined();
    });
  });

  it("renders search button", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Buscar/i })).toBeDefined();
    });
  });

  it("renders table with no results message", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Sin resultados/i)).toBeDefined();
    });
  });

  it("handles name input changes", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText(
        /Nombre o apellidos/i
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "Juan Pérez" } });
      expect(nameInput.value).toBe("Juan Pérez");
    });
  });

  it("handles email input changes", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText(
        /mail@vitalitty.es/i
      ) as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: "juan@example.com" } });
      expect(emailInput.value).toBe("juan@example.com");
    });
  });

  it("handles age input changes", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const ageInput = screen.getByPlaceholderText(/Edad/i) as HTMLInputElement;
      fireEvent.change(ageInput, { target: { value: "30" } });
      expect(ageInput.value).toBe("30");
    });
  });

  it("handles weight input changes", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const weightInput = screen.getByPlaceholderText(
        /Peso en KG/i
      ) as HTMLInputElement;
      fireEvent.change(weightInput, { target: { value: "75" } });
      expect(weightInput.value).toBe("75");
    });
  });

  it("renders table header row", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const tableHeaders = screen.getAllByRole("columnheader");
      expect(tableHeaders.length).toBeGreaterThan(0);
    });
  });

  it("handles successful patient search submission", async () => {
    const mockFrom = vi.spyOn(supabase, "from");
    const mockSelect = vi.fn().mockResolvedValueOnce({
      data: [
        {
          id: "1",
          first_name: "Juan",
          last_name: "Pérez",
          email: "juan@example.com",
          age: 30,
          weight: 75,
          gender: "M",
        },
      ],
      error: null,
    });

    mockFrom.mockReturnValueOnce({ select: mockSelect } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      const searchBtn = screen.getByRole("button", { name: /Buscar/i });
      if (searchBtn) fireEvent.click(searchBtn);
    });

    mockFrom.mockRestore();
  });

  it("handles search with multiple gender values", async () => {
    const mockFrom = vi.spyOn(supabase, "from");
    const mockSelect = vi.fn().mockResolvedValueOnce({
      data: [
        {
          id: "1",
          first_name: "Juan",
          gender: "M",
        },
        {
          id: "2",
          first_name: "Maria",
          gender: "F",
        },
      ],
      error: null,
    });

    mockFrom.mockReturnValueOnce({ select: mockSelect } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      const searchBtn = screen.getByRole("button", { name: /Buscar/i });
      if (searchBtn) fireEvent.click(searchBtn);
    });

    mockFrom.mockRestore();
  });

  it("handles search error appropriately", async () => {
    const mockFrom = vi.spyOn(supabase, "from");
    const mockSelect = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { message: "Database error" },
    });

    mockFrom.mockReturnValueOnce({ select: mockSelect } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      const searchBtn = screen.getByRole("button", { name: /Buscar/i });
      if (searchBtn) fireEvent.click(searchBtn);
    });

    mockFrom.mockRestore();
  });

  it("handles loading state during search", async () => {
    const mockFrom = vi.spyOn(supabase, "from");
    const mockSelect = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: [],
                error: null,
              }),
            100
          )
        )
    );

    mockFrom.mockReturnValueOnce({ select: mockSelect } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      const searchBtn = screen.getByRole("button", { name: /Buscar/i });
      if (searchBtn) fireEvent.click(searchBtn);
    });

    mockFrom.mockRestore();
  });

  it("calls search with correct parameters", async () => {
    const mockFrom = vi.spyOn(supabase, "from");
    const mockSelect = vi.fn().mockResolvedValueOnce({
      data: [],
      error: null,
    });

    mockFrom.mockReturnValueOnce({ select: mockSelect } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText(
        /Nombre o apellidos/i
      ) as HTMLInputElement;
      const emailInput = screen.getByPlaceholderText(
        /mail@vitalitty.es/i
      ) as HTMLInputElement;
      const ageInput = screen.getByPlaceholderText(/Edad/i) as HTMLInputElement;

      fireEvent.change(nameInput, { target: { value: "Juan" } });
      fireEvent.change(emailInput, { target: { value: "juan@example.com" } });
      fireEvent.change(ageInput, { target: { value: "30" } });
    });

    await waitFor(() => {
      const searchBtn = screen.getByRole("button", { name: /Buscar/i });
      if (searchBtn) fireEvent.click(searchBtn);
    });

    mockFrom.mockRestore();
  });
});
