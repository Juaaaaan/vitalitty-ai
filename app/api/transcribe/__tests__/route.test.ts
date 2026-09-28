import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { transcribeAudio } = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
}));

vi.mock("@/services/trasncription-service", () => ({ transcribeAudio }));

import { POST } from "../route";

function requestWith(audio: File | null): NextRequest {
  const formData = new FormData();
  if (audio) formData.append("audio", audio);
  return { formData: async () => formData } as unknown as NextRequest;
}

function audioFile(): File {
  return new File(["fake audio"], "audio.webm", { type: "audio/webm" });
}

describe("POST /api/transcribe", () => {
  beforeEach(() => {
    transcribeAudio.mockReset();
  });

  it("devuelve 200 con la transcripción", async () => {
    transcribeAudio.mockResolvedValue({ text: "dos huevos y 40 g de avena" });

    const response = await POST(requestWith(audioFile()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "dos huevos y 40 g de avena",
    });
  });

  it("devuelve 413 cuando el audio supera el límite", async () => {
    transcribeAudio.mockResolvedValue({
      text: "",
      error: "La grabación es demasiado larga (máximo 10 MB).",
      errorCode: "FILE_TOO_LARGE",
    });

    const response = await POST(requestWith(audioFile()));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/10 MB/);
    expect(body.text).toBe("");
  });

  it("devuelve 500 cuando falla el proveedor", async () => {
    transcribeAudio.mockResolvedValue({ text: "", error: "upstream boom" });

    const response = await POST(requestWith(audioFile()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("upstream boom");
    expect(body.text).toBe("");
  });

  it("devuelve 400 sin audio y no llama al servicio", async () => {
    const response = await POST(requestWith(null));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No audio file provided");
    expect(transcribeAudio).not.toHaveBeenCalled();
  });
});
