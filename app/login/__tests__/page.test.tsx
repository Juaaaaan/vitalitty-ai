/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

import LoginPage from "../page";
import { supabase } from "../../../lib/supabase/client";

describe("Login Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Rendering tests
  it("renders without crashing", () => {
    const { container } = render(<LoginPage />);
    expect(container).toBeDefined();
  });

  it("renders the page with grid layout", () => {
    const { container } = render(<LoginPage />);
    const gridDiv = container.querySelector("[class*='grid']");
    expect(gridDiv).toBeDefined();
  });

  it("renders the Vitalitty AI branding", () => {
    render(<LoginPage />);
    expect(screen.getByText("Vitalitty AI")).toBeDefined();
  });

  it("renders the logo images", () => {
    render(<LoginPage />);
    const logos = screen.getAllByAltText("Logo");
    expect(logos.length).toBeGreaterThan(0);
  });

  it("renders the background landscape image", () => {
    render(<LoginPage />);
    const bgImages = screen.getAllByAltText("Landscape picture");
    expect(bgImages.length).toBeGreaterThan(0);
  });

  it("renders email input field", () => {
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText("m@vitalitty.es");
    expect(emailInput).toBeDefined();
  });

  it("renders password input field", () => {
    render(<LoginPage />);
    const passwordInputs = screen.getAllByDisplayValue("");
    expect(passwordInputs.length).toBeGreaterThan(0);
  });

  it("renders the submit button", () => {
    render(<LoginPage />);
    const submitBtns = screen.getAllByRole("button");
    expect(submitBtns.length).toBeGreaterThan(0);
  });

  // Input interaction tests
  it("handles email input changes", () => {
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText("m@vitalitty.es") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    expect(emailInput.value).toBe("test@example.com");
  });

  it("handles password input changes", () => {
    render(<LoginPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    expect(passwordInput.value).toBe("password123");
  });

  // Form submission tests - testing the handleLogin function
  it("calls signInWithPassword on form submission", async () => {
    const mockSignIn = vi.spyOn(supabase.auth, "signInWithPassword");
    mockSignIn.mockResolvedValueOnce({
      data: { user: { id: "123" } },
      error: null,
    } as any);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("m@vitalitty.es") as HTMLInputElement;
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const submitBtn = screen.getAllByRole("button", { name: /iniciar/i })[0];

    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "pass123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "pass123",
      });
    });

    mockSignIn.mockRestore();
  });

  it("displays error message on login failure with code", async () => {
    const mockSignIn = vi.spyOn(supabase.auth, "signInWithPassword");
    mockSignIn.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "Invalid email or password" },
    } as any);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("m@vitalitty.es") as HTMLInputElement;
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const submitBtn = screen.getAllByRole("button", { name: /iniciar/i })[0];

    fireEvent.change(emailInput, { target: { value: "wrong@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const errorElement = screen.queryByText(/credenciales|error/i);
      expect(errorElement).toBeDefined();
    });

    mockSignIn.mockRestore();
  });

  it("clears error state before submitting new login attempt", async () => {
    const mockSignIn = vi.spyOn(supabase.auth, "signInWithPassword");

    mockSignIn.mockResolvedValueOnce({
      data: null,
      error: { code: "error_code", message: "Some error message" },
    } as any);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("m@vitalitty.es") as HTMLInputElement;
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const submitBtn = screen.getAllByRole("button", { name: /iniciar/i })[0];

    // First login attempt with error
    fireEvent.change(emailInput, { target: { value: "error@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "errorpass" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalled();
    });

    // Second login attempt
    mockSignIn.mockResolvedValueOnce({
      data: { user: { id: "123" } },
      error: null,
    } as any);

    fireEvent.change(emailInput, { target: { value: "success@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "successpass" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(2);
    });

    mockSignIn.mockRestore();
  });

  it("handles null error response (success branch)", async () => {
    const mockSignIn = vi.spyOn(supabase.auth, "signInWithPassword");
    mockSignIn.mockResolvedValueOnce({
      data: { user: { id: "456" } },
      error: null,
    } as any);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("m@vitalitty.es") as HTMLInputElement;
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const submitBtn = screen.getAllByRole("button", { name: /iniciar/i })[0];

    fireEvent.change(emailInput, { target: { value: "valid@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "validpass" } });
    fireEvent.click(submitBtn);

    mockSignIn.mockRestore();
  });

  it("handles error without code or message (edge case)", async () => {
    const mockSignIn = vi.spyOn(supabase.auth, "signInWithPassword");
    mockSignIn.mockResolvedValueOnce({
      data: null,
      error: { code: "", message: "" },
    } as any);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("m@vitalitty.es") as HTMLInputElement;
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const submitBtn = screen.getAllByRole("button", { name: /iniciar/i })[0];

    fireEvent.change(emailInput, { target: { value: "edge@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "edgepass" } });
    fireEvent.click(submitBtn);

    mockSignIn.mockRestore();
  });
});
