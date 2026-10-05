import { describe, expect, it, vi } from "vitest";
import { LocalSpeechHttpEngine } from "./LocalSpeechHttpEngine.js";

describe("LocalSpeechHttpEngine", () => {
  it("sends audio to Whistle and returns a Dutch transcript", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: "  Hoe oud bent u? " })),
    );
    const engine = new LocalSpeechHttpEngine({
      serverUrl: "http://whistle:8080",
      name: "Whistle",
      fetch: fetcher,
    });
    const signal = new AbortController().signal;
    await expect(engine.transcribe({
      audio: new Uint8Array([1, 2]),
      mimeType: "audio/webm",
      language: "nl-NL",
      signal,
    })).resolves.toEqual({ text: "Hoe oud bent u?" });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://whistle:8080/transcribe"),
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "audio/webm", "x-sodalis-language": "nl" },
        signal,
      }),
    );
  });

  it("surfaces unsupported languages and engine failures", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: "Model unavailable." }), { status: 503 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ other: true })));
    const engine = new LocalSpeechHttpEngine({
      serverUrl: "http://whistle:8080", name: "Whistle", fetch: fetcher,
    });
    const request = {
      audio: new Uint8Array([1]),
      mimeType: "audio/wav",
      signal: new AbortController().signal,
    };
    await expect(engine.transcribe({ ...request, language: "fr-FR" }))
      .rejects.toThrow('does not support "fr-FR"');
    await expect(engine.transcribe({ ...request, language: "nl-NL" }))
      .rejects.toThrow("Model unavailable.");
    await expect(engine.transcribe({ ...request, language: "nl-NL" }))
      .rejects.toThrow("invalid transcript");
  });
});
