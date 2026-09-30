import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
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
    disabled,
  }: {
    onRecordingComplete: (blob: Blob) => void;
    disabled?: boolean;
  }) => (
    <button
      disabled={disabled}
      onClick={() => onRecordingComplete(new Blob(["audio"]))}
    >
      fake-record
    </button>
  ),
}));

beforeAll(() => {
  // El selector de pacientes (cmdk + Radix) espera APIs que jsdom no trae.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= vi.fn();
});

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

function processConsultationBody() {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => url === "/api/process-consultation");
  return JSON.parse((call?.[1] as RequestInit).body as string);
}

async function waitForPatients() {
  const { supabase } = await import("../../../lib/supabase/client");
  await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
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
                dietVersion: 2,
              },
            ]),
          );
        }
        if (url === "/api/diet-preview") {
          // Al cerrarse el stream la consulta ya está guardada, así que la
          // página pasa del markdown en bruto a la vista previa maquetada.
          return new Response(
            JSON.stringify({
              html: "<!doctype html><html><body>Subir la proteína</body></html>",
              structured: true,
            }),
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });

  it("no deja grabar hasta elegir paciente nuevo o existente", async () => {
    render(<DietsPage />);
    await waitForPatients();

    expect(screen.getByText("fake-record")).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("radio", { name: /Paciente existente/ }));
    expect(screen.getByText("fake-record")).toHaveProperty("disabled", true);
    expect(
      screen.getByText("Elige un paciente de la lista para empezar a grabar"),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: /Paciente nuevo/ }));
    expect(screen.getByText("fake-record")).toHaveProperty("disabled", false);
  });

  it("paciente existente: envía su id y genera en streaming sin bloquear la UI", async () => {
    render(<DietsPage />);
    await waitForPatients();

    fireEvent.click(screen.getByRole("radio", { name: /Paciente existente/ }));
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText(/laura@example.com/));

    // Con el paciente elegido, su tabla de datos queda montada durante el stream.
    expect(screen.getByText("Información del Paciente")).toBeDefined();
    fireEvent.click(screen.getByText("fake-record"));

    fireEvent.click(await screen.findByText("Generar dieta"));

    await screen.findByText("Dieta generada", {}, { timeout: 3000 });
    // Guardada la consulta, el documento se ve maquetado con la plantilla: el
    // markdown en bruto deja paso a la vista previa, que es sobre la que se
    // corrige y se aprueba.
    // El iframe se monta vacío y se rellena cuando responde la vista previa.
    await waitFor(() =>
      expect(
        screen.getByTitle("Vista previa de la dieta").getAttribute("srcdoc"),
      ).toContain("Subir la proteína"),
    );
    expect(screen.getByText("Modificar")).toBeDefined();
    expect(screen.getByText("Aprobar y generar PDF")).toBeDefined();
    expect(screen.getByText(/versión 2/)).toBeDefined();
    expect(processConsultationBody()).toEqual({
      transcription: "Revisión de Laura, sube la proteína.",
      patientMode: "existing",
      patientId: "patient-1",
    });
  });

  it("paciente nuevo: no asocia a nadie aunque el audio nombre a un paciente existente", async () => {
    render(<DietsPage />);
    await waitForPatients();

    fireEvent.click(screen.getByRole("radio", { name: /Paciente nuevo/ }));
    fireEvent.click(screen.getByText("fake-record"));

    // La transcripción dice "Laura", que existe: no se sugiere ni se selecciona.
    fireEvent.click(await screen.findByText("Crear paciente y generar dieta"));
    expect(screen.queryByText("Información del Paciente")).toBeNull();

    await screen.findByText("Dieta generada", {}, { timeout: 3000 });
    expect(processConsultationBody()).toEqual({
      transcription: "Revisión de Laura, sube la proteína.",
      patientMode: "new",
      patientId: null,
    });
  });
});
