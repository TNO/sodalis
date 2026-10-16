import { describe, expect, it, vi } from "vitest";
import { AzureSttEngine } from "./AzureSttEngine.js";

const endpoint =
  "https://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Azure STT engine", () => {
  it("uploads the utterance with its locale and returns the combined transcript", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      durationMilliseconds: 1800,
      combinedPhrases: [{ text: " Hoe oud bent u? " }],
      phrases: [{ text: "Hoe oud bent u?" }],
    }));
    const engine = new AzureSttEngine({ endpoint, key: "example-key", fetch: fetcher });
    const signal = new AbortController().signal;

    await expect(engine.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      language: "nl-NL",
      signal,
    })).resolves.toEqual({ text: "Hoe oud bent u?" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(endpoint);
    expect(init).toEqual(expect.objectContaining({
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": "example-key" },
      signal,
    }));
    const form = init?.body as FormData;
    expect(JSON.parse(String(form.get("definition")))).toEqual({ locales: ["nl-NL"] });
    const audio = form.get("audio") as File;
    expect(audio.name).toBe("speech.webm");
    expect(audio.type).toBe("audio/webm");
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(engine.partialResults).toBe(false);
  });

  it("returns an empty transcript when Azure recognizes no speech", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      durationMilliseconds: 3000,
      combinedPhrases: [],
      phrases: [],
    }));
    const engine = new AzureSttEngine({ endpoint, key: "example-key", fetch: fetcher });

    await expect(engine.transcribe({
      audio: new Uint8Array([0]),
      mimeType: "audio/ogg",
      language: "en-US",
      signal: new AbortController().signal,
    })).resolves.toEqual({ text: "" });
  });

  it("reports Azure failures and malformed responses without exposing the key", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        error: { code: "InvalidArgument", message: "Unsupported locale example-key." },
      }, 400))
      .mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ phrases: "not a transcript" }));
    const engine = new AzureSttEngine({ endpoint, key: "example-key", fetch: fetcher });
    const request = {
      audio: new Uint8Array([1]),
      mimeType: "audio/webm",
      language: "nl-NL",
      signal: new AbortController().signal,
    };

    const errors: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await engine.transcribe(request).then(
        () => errors.push("resolved"),
        (error: Error) => errors.push(error.message),
      );
    }
    expect(errors).toEqual([
      "Azure STT returned HTTP 400: InvalidArgument: Unsupported locale [redacted].",
      "Azure STT returned HTTP 502.",
      "Azure STT returned an invalid transcript.",
    ]);
  });

  it("rejects unsafe configuration before any audio can be sent", () => {
    const invalidEndpoints = [
      "http://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
      "https://user:pass@example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
      "https://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe",
      "https://example.cognitiveservices.azure.com/cognitiveservices/v1?api-version=2025-10-15",
      "not a url",
    ];
    for (const invalid of invalidEndpoints) {
      expect(() => new AzureSttEngine({ endpoint: invalid, key: "example-key" }))
        .toThrow(/AZURE_STT_URL/);
    }
    expect(() => new AzureSttEngine({ endpoint, key: " " })).toThrow(/AZURE_STT_KEY/);
  });

  it("does not upload unsupported languages or already-cancelled utterances", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const engine = new AzureSttEngine({ endpoint, key: "example-key", fetch: fetcher });
    const cancelled = new AbortController();
    cancelled.abort(new DOMException("Speech recognition was cancelled.", "AbortError"));

    await expect(engine.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/webm",
      language: "de-DE",
      signal: new AbortController().signal,
    })).rejects.toThrow('Azure STT does not support "de-DE".');
    await expect(engine.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/webm",
      language: "nl-NL",
      signal: cancelled.signal,
    })).rejects.toThrow("Speech recognition was cancelled.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
