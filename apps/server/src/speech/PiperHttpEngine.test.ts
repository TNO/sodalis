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

/** Like real fetch: aborting the request signal errors the response body stream. */
function abortableResponse(init: RequestInit | undefined, chunks: readonly Uint8Array[]): Response {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
    },
  }));
}

/** Rejections nobody handled while `action` ran and settled; such rejections crash the speech service. */
async function unhandledRejections(action: () => Promise<unknown>): Promise<unknown[]> {
  const reasons: unknown[] = [];
  const record = (reason: unknown) => { reasons.push(reason); };
  process.on("unhandledRejection", record);
  try {
    await action().catch(() => undefined);
    await new Promise((done) => setTimeout(done, 20));
  } finally {
    process.off("unhandledRejection", record);
  }
  return reasons;
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

  it("survives a client hanging up while Piper audio is still streaming", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) =>
      abortableResponse(init, [wav(new Uint8Array([1, 0, 2, 0]))]));
    const engine = new PiperHttpEngine({ serverUrl: "http://localhost:5000", fetch: fetcher });
    const controller = new AbortController();
    const iterator = engine.synthesize(request, controller.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    expect(await unhandledRejections(async () => {
      controller.abort(new Error("Client connection prematurely closed."));
      await iterator.next();
    })).toEqual([]);
  });

  it("speaks the default Ronnie voice and refuses the former default voice", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(Uint8Array.from(wav(new Uint8Array([1, 0])))));
    const engine = new PiperHttpEngine({ serverUrl: "http://localhost:5000", fetch: fetcher });
    const speak = async (voice: string) => {
      for await (const _chunk of engine.synthesize({ ...request, voice }, new AbortController().signal)) {
        // Consume the stream.
      }
    };
    await expect(speak("nl_NL-ronnie-medium")).resolves.toBeUndefined();
    await expect(speak("nl_BE-nathalie-medium")).rejects.toThrow("voice");
  });
});
