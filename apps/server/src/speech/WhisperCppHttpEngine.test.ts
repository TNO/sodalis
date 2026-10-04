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
