import { describe, expect, it, vi } from "vitest";
import { PiperHttpEngine } from "./PiperHttpEngine.js";

function wav(pcm: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) bytes[offset + index] = text.charCodeAt(index);
  };
  write(0, "RIFF"); view.setUint32(4, bytes.length - 8, true);
  write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, "data");
  view.setUint32(40, pcm.length, true); bytes.set(pcm, 44);
  return bytes;
}

describe("Piper HTTP engine", () => {
  const request = {
    sessionId: "s", speechId: "t", text: "Hallo", language: "nl-NL",
  } as const;

  it("converts streamed Piper WAV into the existing PCM contract", async () => {
    const bytes = wav(new Uint8Array([1, 0, 2, 0]));
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 22));
        controller.enqueue(bytes.slice(22, 45));
        controller.enqueue(bytes.slice(45));
        controller.close();
      },
    }), { headers: { "content-type": "text/html; charset=utf-8" } }));
    const engine = new PiperHttpEngine({
      serverUrl: "http://localhost:5000", fetch: fetcher as typeof fetch,
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of engine.synthesize(request, new AbortController().signal)) {
      chunks.push(chunk);
    }
    expect(Uint8Array.from(chunks.flatMap((chunk) => [...chunk]))).toEqual(bytes.slice(44));
    expect(fetcher).toHaveBeenCalledWith("http://localhost:5000/synthesize", expect.objectContaining({
      method: "POST", body: JSON.stringify({ text: "Hallo" }),
    }));
  });

  it("retains an explicitly configured root endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const engine = new PiperHttpEngine({
      serverUrl: "http://localhost:5000/", fetch: fetcher as typeof fetch,
    });
    await expect(async () => {
      for await (const _chunk of engine.synthesize(request, new AbortController().signal)) {
        // Consume the stream.
      }
    }).rejects.toThrow("HTTP 500");
    expect(fetcher).toHaveBeenCalledWith("http://localhost:5000/", expect.any(Object));
  });

  it("fails explicitly on unsupported audio and propagates cancellation", async () => {
    const engine = new PiperHttpEngine({
      serverUrl: "http://localhost:5000",
      fetch: vi.fn(async () => new Response("bad", { headers: { "content-type": "text/plain" } })) as typeof fetch,
    });
    await expect(async () => {
      for await (const _chunk of engine.synthesize(request, new AbortController().signal)) {
        // Consume the stream.
      }
    }).rejects.toThrow("incomplete WAV");
    const controller = new AbortController();
    controller.abort();
    await expect(async () => {
      for await (const _chunk of engine.synthesize(request, controller.signal)) {
        // Consume the stream.
      }
    }).rejects.toThrow();
  });
});
