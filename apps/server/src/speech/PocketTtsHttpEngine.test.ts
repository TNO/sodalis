import { describe, expect, it, vi } from "vitest";
import { PocketTtsHttpEngine } from "./PocketTtsHttpEngine.js";

describe("Pocket TTS HTTP engine", () => {
  const request = {
    sessionId: "turn-1",
    speechId: "reply-1",
    text: "Stationsstraat 24",
    language: "nl-NL",
  } as const;

  it("normalizes numbers for Pocket and streams its 24 kHz PCM", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 0]));
            controller.enqueue(new Uint8Array([2, 0]));
            controller.close();
          },
        }),
        { headers: { "content-type": "audio/pcm" } },
      ),
    );
    const engine = new PocketTtsHttpEngine({
      serverUrl: "http://host.docker.internal:8094",
      apiKey: "test-secret",
      voice: "piper-female-nl-reference",
      fetch: fetcher,
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of engine.synthesize(
      request,
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(engine.mimeType).toBe(
      "audio/pcm;rate=24000;bits=16;channels=1;endianness=little",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://host.docker.internal:8094/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer test-secret",
          "content-type": "application/json",
          accept: "audio/pcm",
        },
        body: JSON.stringify({
          input: "Stationsstraat vierentwintig",
          voice: "piper-female-nl-reference",
          response_format: "pcm",
          seed: 42,
        }),
      }),
    );
    expect(chunks).toEqual([
      new Uint8Array([1, 0]),
      new Uint8Array([2, 0]),
    ]);
  });

  it("requires the selected local voice and propagates errors and cancellation", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response("runtime unavailable", { status: 502 }),
    );
    const engine = new PocketTtsHttpEngine({
      serverUrl: "http://localhost:8094/",
      apiKey: "test-secret",
      voice: "piper-female-nl-reference",
      fetch: fetcher,
    });
    await expect(async () => {
      for await (const _chunk of engine.synthesize(
        { ...request, voice: "another-voice" },
        new AbortController().signal,
      )) {
        // Consume the stream.
      }
    }).rejects.toThrow("voice");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(async () => {
      for await (const _chunk of engine.synthesize(
        request,
        new AbortController().signal,
      )) {
        // Consume the stream.
      }
    }).rejects.toThrow("HTTP 502");

    const abort = new AbortController();
    abort.abort();
    await expect(async () => {
      for await (const _chunk of engine.synthesize(request, abort.signal)) {
        // Consume the stream.
      }
    }).rejects.toThrow();
  });
});
