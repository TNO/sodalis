import { describe, expect, it, vi } from "vitest";
import { AzureTtsEngine } from "./AzureTtsEngine.js";

const request = {
  sessionId: "session-1",
  speechId: "speech-1",
  language: "nl-NL",
  text: "Tom & <Anne> zeggen: \"hallo\".",
} as const;

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

describe("Azure TTS engine", () => {
  it.each([0.75, 0.85, 1.25])("applies validated Colette prosody at rate %s and still escapes text", async (rate) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([0, 0])));
    const engine = new AzureTtsEngine({
      endpoint: "https://example.cognitiveservices.azure.com/",
      key: "test-key", voice: "nl-NL-ColetteNeural", fetch: fetcher,
    });
    for await (const _chunk of engine.synthesize({ ...request, rate }, new AbortController().signal)) { /* drain */ }
    expect(engine.supportsRate).toBe(true);
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain(`<prosody rate="${Math.round((rate - 1) * 100)}%">`);
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain("&lt;Anne&gt;");
    await expect(engine.synthesize({ ...request, rate: 0 }, new AbortController().signal)[Symbol.asyncIterator]().next()).rejects.toThrow("rate");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("leaves HD prosody to the documented playback fallback", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([0, 0])));
    const engine = new AzureTtsEngine({
      endpoint: "https://example.cognitiveservices.azure.com/",
      key: "test-key", voice: "en-US-Adam:DragonHDLatestNeural", fetch: fetcher,
    });
    for await (const _chunk of engine.synthesize({ ...request, rate: 0.8 }, new AbortController().signal)) { /* drain */ }
    expect(engine.supportsRate).toBe(false);
    expect(fetcher.mock.calls[0]?.[1]?.body).not.toContain("<prosody");
  });

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

  it("survives a client hanging up while Azure audio is still streaming", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) =>
      abortableResponse(init, [new Uint8Array([1, 0])]));
    const engine = new AzureTtsEngine({
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      key: "example-key",
      voice: "nl-NL-ColetteNeural",
      fetch: fetcher,
    });
    const controller = new AbortController();
    const iterator = engine.synthesize(request, controller.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    expect(await unhandledRejections(async () => {
      controller.abort(new Error("Client connection prematurely closed."));
      await iterator.next();
    })).toEqual([]);
  });

  describe("Foundry resources and multilingual voices", () => {
    const pcm = () => vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 0])));
    const speak = async (engine: AzureTtsEngine) => {
      for await (const _chunk of engine.synthesize(request, new AbortController().signal)) {
        // Consume the audio stream.
      }
    };

    it("speaks Dutch with a multilingual HD voice by marking the reply as Dutch", async () => {
      const fetcher = pcm();
      const engine = new AzureTtsEngine({
        endpoint: "https://soladis-foundry.cognitiveservices.azure.com/tts/cognitiveservices/v1",
        key: "example-key",
        voice: "en-US-Adam:DragonHDLatestNeural",
        fetch: fetcher,
      });
      await speak(engine);
      const body = String(fetcher.mock.calls[0]![1]!.body);
      expect(body).toContain('xml:lang="nl-NL"><voice name="en-US-Adam:DragonHDLatestNeural">' +
        '<lang xml:lang="nl-NL">Tom &amp; &lt;Anne&gt;');
      expect(body).toContain('xmlns="http://www.w3.org/2001/10/synthesis"');
    });

    it("leaves a native Dutch voice's own language untouched", async () => {
      const fetcher = pcm();
      await speak(new AzureTtsEngine({
        endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
        key: "example-key",
        voice: "nl-NL-FennaNeural",
        fetch: fetcher,
      }));
      const body = String(fetcher.mock.calls[0]![1]!.body);
      expect(body).toContain('<voice name="nl-NL-FennaNeural">Tom &amp;');
      expect(body).not.toContain("<lang");
    });

    it("reaches speech synthesis from a bare Foundry resource endpoint", async () => {
      const fetcher = pcm();
      await speak(new AzureTtsEngine({
        endpoint: "https://soladis-foundry.cognitiveservices.azure.com/",
        key: "example-key",
        voice: "nl-NL-FennaNeural",
        fetch: fetcher,
      }));
      expect(fetcher.mock.calls[0]![0]).toBe(
        "https://soladis-foundry.cognitiveservices.azure.com/tts/cognitiveservices/v1");
    });

    it("explains that a Foundry project endpoint cannot synthesize speech", () => {
      expect(() => new AzureTtsEngine({
        endpoint: "https://soladis-foundry.services.ai.azure.com/api/projects/sodalis",
        key: "example-key",
        voice: "nl-NL-FennaNeural",
      })).toThrow(/project endpoint.*cognitiveservices\.azure\.com/);
    });

    it("rejects voice names that are not Azure voices", () => {
      for (const voice of ["nl_BE-nathalie-medium", 'nl-NL-Fenna"Neural', "Adam", "en-US-Adam:Dragon HD"]) {
        expect(() => new AzureTtsEngine({
          endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
          key: "example-key",
          voice,
        }), voice).toThrow("AZURE_TTS_VOICE");
      }
    });
  });
});
