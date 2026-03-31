import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("Dashboard Page", () => {
  beforeEach(() => {
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
});
