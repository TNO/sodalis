import { describe, expect, it, vi } from "vitest";
import { WhisperCppHttpEngine } from "./WhisperCppHttpEngine.js";

describe("WhisperCppHttpEngine", () => {
  it("maps Dutch to Whisper's language tag and normalizes its transcript", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ text: "  Goedemorgen.  " }), {
          headers: { "content-type": "application/json" },
        }),
      );
    const engine = new WhisperCppHttpEngine({
      serverUrl: "http://whisper.local:8081/",
      fetch: fetcher,
    });

    await expect(
      engine.transcribe({
        audio: Uint8Array.from([1, 2]),
        mimeType: "audio/webm",
        language: "nl-NL",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ text: "Goedemorgen." });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://whisper.local:8081/inference");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get("language")).toBe("nl");
    expect(form.get("response_format")).toBe("json");
    expect(form.get("no_speech_thold")).toBe("0.6");
  });

  it("forwards a configured no_speech_thold override", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ text: "Hi." })));
    const engine = new WhisperCppHttpEngine({
      serverUrl: "http://whisper.local:8081",
      fetch: fetcher,
      noSpeechThreshold: 0.8,
    });

    await engine.transcribe({
      audio: Uint8Array.from([1]),
      mimeType: "audio/webm",
      language: "en-US",
      signal: new AbortController().signal,
    });

    const form = fetcher.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get("no_speech_thold")).toBe("0.8");
  });

  it("requests verbose word timestamps and aligns them to source words", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        text: "Hello um world.",
        duration: 1,
        segments: [{
          words: [
            { word: " Hello,", start: 0, end: 0.4 },
            { word: "um", start: 0.4, end: 0.5 },
            { word: "WORLD!", start: 0.6, end: 0.9 },
          ],
        }],
      }),
    );
    const engine = new WhisperCppHttpEngine({
      serverUrl: "http://whisper.local:8081",
      fetch: fetcher,
    });

    await expect(engine.transcribeWithWordTimestamps({
      audio: new Uint8Array([1, 2]),
      mimeType: "audio/wav",
      language: "en-US",
      signal: new AbortController().signal,
    }, "Hello, brave world!")).resolves.toEqual({
      text: "Hello um world.",
      wordTimestamps: [
        { word: "Hello", start: 0, end: 0.4 },
        { word: "brave", start: 0.4, end: 0.6 },
        { word: "world", start: 0.6, end: 0.9 },
      ],
    });
    const form = fetcher.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("token_timestamps")).toBe("true");
  });

  it("rejects unsupported languages and invalid engine responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ result: "No text field." })),
    );
    const engine = new WhisperCppHttpEngine({
      serverUrl: "http://whisper.local:8081",
      fetch: fetcher,
    });
    const request = {
      audio: Uint8Array.from([1]),
      mimeType: "audio/webm",
      signal: new AbortController().signal,
    };

    await expect(
      engine.transcribe({ ...request, language: "fr-FR" }),
    ).rejects.toThrow('does not support "fr-FR"');
    await expect(
      engine.transcribe({ ...request, language: "nl-NL" }),
    ).rejects.toThrow("did not contain a transcript");
  });
});
