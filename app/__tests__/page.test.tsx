import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("Home page", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders without crashing", () => {
    const { container } = render(<Home />);
    expect(container).toBeDefined();
  });

  it("renders the root div with correct classes", () => {
    const { container } = render(<Home />);
    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.tagName).toBe("DIV");
    expect(rootDiv.className).toContain("min-h-screen");
    expect(rootDiv.className).toContain("flex");
    expect(rootDiv.className).toContain("items-center");
    expect(rootDiv.className).toContain("justify-center");
  });

  it("redirects to /dashboard on mount", () => {
    render(<Home />);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("does not render any visible content", () => {
    render(<Home />);
    // The page is intentionally empty while redirecting
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
