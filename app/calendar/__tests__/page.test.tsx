import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CalendarPage from "../page";

const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

describe("Calendar Page", () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  it("renders without crashing", () => {
    const { container } = render(<CalendarPage />);
    expect(container).toBeDefined();
  });

  it("renders the root div with correct classes", () => {
    const { container } = render(<CalendarPage />);
    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.className).toContain("min-h-screen");
    expect(rootDiv.className).toContain("bg-gray-50");
  });

  it("renders the Calendario heading", () => {
    render(<CalendarPage />);
    expect(screen.getByText("Calendario")).toBeDefined();
  });

  it("renders the back button", () => {
    render(<CalendarPage />);
    expect(screen.getByRole("button", { name: /Volver/i })).toBeDefined();
  });

  it("calls router.back() when back button is clicked", () => {
    render(<CalendarPage />);
    const backButton = screen.getByRole("button", { name: /Volver/i });
    fireEvent.click(backButton);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("renders inner wrapper with max-width class", () => {
    const { container } = render(<CalendarPage />);
    const inner = container.querySelector(".max-w-4xl");
    expect(inner).toBeDefined();
  });

  it("renders the heading as an h1 element", () => {
    render(<CalendarPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeDefined();
    expect(heading.textContent).toBe("Calendario");
  });
});
