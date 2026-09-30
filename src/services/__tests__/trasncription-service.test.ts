import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../../lib/ai/openai", () => ({
  default: { audio: { transcriptions: { create: createMock } } },
}));

import {
  MAX_AUDIO_BYTES,
  transcribeAudio,
} from "@/services/trasncription-service";

/**
 * Blob con un `size` declarado, para no reservar 10 MB reales en el test.
 */
function blobOfSize(size: number): Blob {
  const blob = new Blob(["x"], { type: "audio/webm" });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
}

describe("transcribeAudio", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ text: "media taza de arroz, 150 gramos" });
  });

  it("rechaza un audio por encima del límite sin llamar al proveedor", async () => {
    const result = await transcribeAudio(blobOfSize(MAX_AUDIO_BYTES + 1));

    expect(createMock).not.toHaveBeenCalled();
    expect(result.errorCode).toBe("FILE_TOO_LARGE");
    expect(result.text).toBe("");
    expect(result.error).toMatch(/10 MB/);
  });

  it("acepta un audio de exactamente el límite", async () => {
    const result = await transcribeAudio(blobOfSize(MAX_AUDIO_BYTES));

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.errorCode).toBeUndefined();
    expect(result.text).toBe("media taza de arroz, 150 gramos");
  });

  it("transcribe con gpt-4o-transcribe, en español y de forma determinista", async () => {
    await transcribeAudio(blobOfSize(1024));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-transcribe",
        language: "es",
        temperature: 0,
        response_format: "json",
      }),
    );
  });

  it("devuelve texto vacío y el error cuando el proveedor falla", async () => {
    createMock.mockRejectedValue(new Error("upstream boom"));

    const result = await transcribeAudio(blobOfSize(1024));

    expect(result.text).toBe("");
    expect(result.error).toBe("upstream boom");
    expect(result.errorCode).toBeUndefined();
  });
});
