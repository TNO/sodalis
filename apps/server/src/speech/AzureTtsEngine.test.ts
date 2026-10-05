import { describe, expect, it, vi } from "vitest";
import { AzureTtsEngine } from "./AzureTtsEngine.js";

const request = {
  sessionId: "session-1",
  speechId: "speech-1",
  language: "nl-NL",
  text: "Tom & <Anne> zeggen: \"hallo\".",
} as const;

describe("Azure TTS engine", () => {
  it("streams Dutch PCM through the selected Azure endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 0]));
          controller.enqueue(new Uint8Array([2, 0]));
          controller.close();
        },
      }),
    ));
    const engine = new AzureTtsEngine({
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      key: "example-key",
      voice: "nl-NL-ColetteNeural",
      fetch: fetcher,
    });

    const signal = new AbortController().signal;
    const chunks: Uint8Array[] = [];
    for await (const chunk of engine.synthesize(request, signal)) chunks.push(chunk);
    expect(chunks).toEqual([
      new Uint8Array([1, 0]),
      new Uint8Array([2, 0]),
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Ocp-Apim-Subscription-Key": "example-key",
          "X-Microsoft-OutputFormat": "raw-22050hz-16bit-mono-pcm",
        }),
        body: expect.stringContaining(
          "Tom &amp; &lt;Anne&gt; zeggen: &quot;hallo&quot;.",
        ),
        signal,
      }),
    );
  });

  it("reassembles PCM samples split across network chunks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.enqueue(new Uint8Array([0, 2, 0]));
          controller.close();
        },
      }),
    ));
    const engine = new AzureTtsEngine({
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      key: "example-key",
      voice: "nl-NL-ColetteNeural",
      fetch: fetcher,
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of engine.synthesize(request, new AbortController().signal)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([new Uint8Array([1, 0, 2, 0])]);
  });

  it("rejects empty or incomplete audio instead of reporting success", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array()))
      .mockResolvedValueOnce(new Response(new Uint8Array([1])));
    const engine = new AzureTtsEngine({
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      key: "example-key",
      voice: "nl-NL-ColetteNeural",
      fetch: fetcher,
    });
    const collect = async () => {
      for await (const _chunk of engine.synthesize(request, new AbortController().signal)) {
        // Consume the audio stream.
      }
    };
    await expect(collect()).rejects.toThrow("empty");
    await expect(collect()).rejects.toThrow("incomplete PCM");
  });

  it("rejects an unavailable service and an unsupported voice without fallback", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    const engine = new AzureTtsEngine({
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      key: "example-key",
      voice: "nl-NL-ColetteNeural",
      fetch: fetcher,
    });
    const collect = async (voice?: string) => {
      for await (const _chunk of engine.synthesize(
        { ...request, ...(voice ? { voice } : {}) },
        new AbortController().signal,
      )) {
        // Consume the audio stream.
      }
    };
    await expect(collect("nl_BE-nathalie-medium")).rejects.toThrow("voice");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(collect()).rejects.toThrow("HTTP 503");
  });

  it("aborts a running response stream when playback is cancelled", async () => {
    let cancelled = false;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 0]));
        },
        cancel() {
          cancelled = true;
        },
      }),
    ));
    const engine = new AzureTtsEngine({
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      key: "example-key",
      voice: "nl-NL-ColetteNeural",
      fetch: fetcher,
    });
    const controller = new AbortController();
    const iterator = engine.synthesize(request, controller.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    controller.abort();
    await expect(iterator.next()).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});
