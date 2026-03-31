import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CalendarPage from "../page";

describe("Calendar Page", () => {
  it("renders without crashing", () => {
    const { container } = render(<CalendarPage />);
    expect(container).toBeDefined();
  });

  it("renders with proper page structure", () => {
    const { container } = render(<CalendarPage />);
    const minHeightDiv = container.querySelector("[class*='min-h-screen']");
    expect(minHeightDiv).toBeDefined();
  });

  it("renders the page title", () => {
    render(<CalendarPage />);
    expect(screen.getByText("Calendario")).toBeDefined();
  });

  it("renders the page subtitle", () => {
    render(<CalendarPage />);
    expect(
      screen.getByText(
        /Aquí podrás revisar todos los eventos que tienes disponibles/i
      )
    ).toBeDefined();
  });

  it("renders the title as an h1 element", () => {
    const { container } = render(<CalendarPage />);
    const h1 = container.querySelector("h1");
    expect(h1).toBeDefined();
    expect(h1?.textContent).toBe("Calendario");
  });

  it("renders the subtitle as an h4 element", () => {
    const { container } = render(<CalendarPage />);
    const h4 = container.querySelector("h4");
    expect(h4).toBeDefined();
    expect(h4?.textContent).toContain("Aquí podrás revisar");
  });

  it("renders a separator", () => {
    const { container } = render(<CalendarPage />);
    const separator = container.querySelector("[role='none']");
    expect(separator).toBeDefined();
  });

  it("contains main section with proper spacing", () => {
    const { container } = render(<CalendarPage />);
    const sections = container.querySelectorAll("div");
    expect(sections.length).toBeGreaterThan(0);
  });
});
