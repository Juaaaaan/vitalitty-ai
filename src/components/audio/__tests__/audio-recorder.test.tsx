import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudioRecorder } from "../audio-recorder";

function renderRecorder(disabled?: boolean) {
  render(
    <AudioRecorder
      onRecordingComplete={vi.fn()}
      onRetryRecording={vi.fn()}
      disabled={disabled}
    />,
  );
  return screen.getByRole("button", { name: /Empezar a grabar/ });
}

describe("AudioRecorder", () => {
  it("no deja empezar a grabar cuando está deshabilitado", () => {
    expect(renderRecorder(true)).toHaveProperty("disabled", true);
  });

  it("deja grabar por defecto", () => {
    expect(renderRecorder()).toHaveProperty("disabled", false);
  });
});
