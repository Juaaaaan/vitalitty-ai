import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const PATIENT = {
  id: "patient-1",
  name_surnames: "Laura Martín",
  mail: "laura@example.com",
  phone: "600000000",
  gender: "M",
};

vi.mock("../../../lib/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [PATIENT], error: null }),
    })),
  },
}));

// El grabador real necesita MediaRecorder; aquí basta con disparar el callback.
vi.mock("@/components/audio/audio-recorder", () => ({
  AudioRecorder: ({
    onRecordingComplete,
  }: {
    onRecordingComplete: (blob: Blob) => void;
  }) => (
    <button onClick={() => onRecordingComplete(new Blob(["audio"]))}>
      fake-record
    </button>
  ),
}));

import DietsPage from "../page";

function ndjsonStream(events: unknown[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });
}

describe("Diets page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/transcribe") {
          return new Response(
            JSON.stringify({ text: "Revisión de Laura, sube la proteína." }),
          );
        }
        if (url === "/api/process-consultation") {
          return new Response(
            ndjsonStream([
              { type: "thinking", text: "Reviso la dieta anterior" },
              { type: "text", text: "# Plan nutricional\n\n" },
              { type: "text", text: "## Objetivos\n\n" },
              { type: "text", text: "- Subir la proteína." },
              {
                type: "done",
                consultationId: "consultation-1",
                patientId: "patient-1",
                patientName: "Laura Martín",
              },
            ]),
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });

  it("genera la dieta en streaming con un paciente existente seleccionado sin bloquear la UI", async () => {
    render(<DietsPage />);

    // Esperar a que carguen los pacientes antes de grabar, o no habrá coincidencia.
    const { supabase } = await import("../../../lib/supabase/client");
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(screen.getByText("fake-record"));

    // Una sola coincidencia: queda seleccionada y su tabla de datos, montada.
    const confirm = await screen.findByText("Confirmar y Generar Dieta");
    expect(screen.getByText("Información del Paciente")).toBeDefined();

    fireEvent.click(confirm);

    await screen.findByText("Dieta generada", {}, { timeout: 3000 });
    expect(screen.getByText(/Subir la proteína/)).toBeDefined();
  });
});
