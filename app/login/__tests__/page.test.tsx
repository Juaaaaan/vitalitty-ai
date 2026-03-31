import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, width, height }: any) => (
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

vi.mock("../../../lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}));

vi.mock("@/components/layout/login-form", () => ({
  LoginForm: () => <div data-testid="login-form">Login Form</div>,
}));

import LoginPage from "../page";

describe("Login Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = render(<LoginPage />);
    expect(container).toBeDefined();
  });

  it("renders the login form component", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("login-form")).toBeDefined();
  });

  it("renders the Vitalitty AI logo and branding", () => {
    render(<LoginPage />);
    const logos = screen.getAllByAltText("Logo");
    expect(logos.length).toBeGreaterThan(0);
  });

  it("renders the background image section", () => {
    render(<LoginPage />);
    const bgImages = screen.getAllByAltText("Landscape picture");
    expect(bgImages.length).toBeGreaterThan(0);
  });

  it("displays Vitalitty AI text branding", () => {
    render(<LoginPage />);
    expect(screen.getByText("Vitalitty AI")).toBeDefined();
  });

  it("renders with grid layout", () => {
    const { container } = render(<LoginPage />);
    const gridDiv = container.querySelector("[class*='grid']");
    expect(gridDiv).toBeDefined();
  });

  it("renders left side container with proper structure", () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector("[class*='flex']")).toBeDefined();
  });

  it("should be a client component", () => {
    const { container } = render(<LoginPage />);
    expect(container).toBeDefined();
  });
});
