import { describe, expect, it, vi } from "vitest";
import { createSpeechApp } from "./app.js";
import type { SpeechRecognitionEngine } from "./WhisperCppHttpEngine.js";
import type { SpeechSynthesisEngine } from "./PiperTtsEngine.js";

const request = {
  sessionId: "turn-1",
  speechId: "reply-1",
  text: "Goedemorgen.",
  language: "nl-NL",
  voice: "nl_NL-ronnie-medium",
};

const sttEngine: SpeechRecognitionEngine = {
  transcribe: vi.fn(async () => ({ text: "" })),
};

describe("speech synthesis API", () => {
  it("streams PCM audio with IDs that let clients reject stale playback", async () => {
    let continueSynthesis: (() => void) | undefined;
    const synthesisPaused = new Promise<void>((resolve) => {
      continueSynthesis = resolve;
    });
    const engine: SpeechSynthesisEngine = {
      async *synthesize() {
        yield new Uint8Array([1, 2]);
        await synthesisPaused;
        yield new Uint8Array([3, 4]);
      },
    };
    const app = createSpeechApp(sttEngine, { ttsEngine: engine });
    const response = await app.request("/api/speech/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "audio/pcm;rate=22050;bits=16;channels=1;endianness=little",
    );
    expect(response.headers.get("x-sodalis-session-id")).toBe("turn-1");
    expect(response.headers.get("x-sodalis-speech-id")).toBe("reply-1");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The TTS response stream is unavailable.");

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: new Uint8Array([1, 2]),
    });
    continueSynthesis?.();
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: new Uint8Array([3, 4]),
    });
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  it("validates Dutch speech requests before starting synthesis", async () => {
    const synthesize = vi.fn(async function* () {
      yield new Uint8Array([1, 2]);
    });
    const app = createSpeechApp(sttEngine, {
      ttsEngine: { synthesize },
    });
    const post = (body: unknown) =>
      app.request("/api/speech/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const unsupportedLanguage = await post({
      ...request,
      language: "fr-FR",
    });
    const unsupportedVoice = await post({
      ...request,
      voice: "nl_NL-pim-medium",
    });
    const emptyAfterCleanup = await post({
      ...request,
      text: "**",
    });
    const invalidSpeechId = await post({
      ...request,
      speechId: "../old",
    });
    const missingEngine = await createSpeechApp(sttEngine).request(
      "/api/speech/tts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    );

    expect(unsupportedLanguage.status).toBe(400);
    expect(unsupportedVoice.status).toBe(400);
    expect(emptyAfterCleanup.status).toBe(400);
    expect(invalidSpeechId.status).toBe(400);
    expect(missingEngine.status).toBe(503);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("accepts only the selected engine's configured voice", async () => {
    const synthesize = vi.fn(async function* () {
      yield new Uint8Array([1, 0]);
    });
    const app = createSpeechApp(sttEngine, {
      ttsEngine: { voiceId: "nl-NL-ColetteNeural", synthesize },
    });
    const post = (voice: string) =>
      app.request("/api/speech/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, voice }),
      });
    expect((await post("nl_NL-ronnie-medium")).status).toBe(400);
    const accepted = await post("nl-NL-ColetteNeural");
    expect(accepted.status).toBe(200);
    await accepted.arrayBuffer();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ voice: "nl-NL-ColetteNeural" }),
      expect.any(AbortSignal),
    );
  });

  it("sends Markdown-cleaned text to the configured engine", async () => {
    const synthesize = vi.fn(async function* () {
      yield new Uint8Array([1, 0]);
    });
    const app = createSpeechApp(sttEngine, { ttsEngine: { synthesize } });
    const response = await app.request("/api/speech/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        text: [
          "# Welkom",
          "",
          "- Lees [deze link](https://example.test) en ![foto](foto.png).",
          "- Gebruik `dit` en **vetgedrukte** tekst.",
          "> Met *nadruk*.",
          "```text",
          "code blijft leesbaar",
          "```",
        ].join("\n"),
      }),
    });

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        text: [
          "Welkom",
          "",
          "Lees deze link en foto.",
          "Gebruik dit en vetgedrukte tekst.",
          "Met nadruk.",
          "code blijft leesbaar",
        ].join("\n"),
      }),
      expect.any(AbortSignal),
    );
  });

  it("synthesizes long replies sequentially and inserts a PCM pause between chunks", async () => {
    const spokenTexts: string[] = [];
    const engine: SpeechSynthesisEngine = {
      async *synthesize(speech) {
        spokenTexts.push(speech.text);
        yield new Uint8Array([1, 0]);
      },
    };
    const pauseMs = 10;
    const app = createSpeechApp(sttEngine, {
      ttsEngine: engine,
      maxTtsChunkCharacters: 80,
      ttsChunkPauseMs: pauseMs,
    });
    const response = await app.request("/api/speech/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        text: [
          "This first sentence has enough words to make a substantial spoken chunk.",
          "This second sentence also has enough words to require a separate spoken chunk.",
        ].join(" "),
      }),
    });
    const audio = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(spokenTexts).toEqual([
      "This first sentence has enough words to make a substantial spoken chunk.",
      "This second sentence also has enough words to require a separate spoken chunk.",
    ]);
    const silenceByteLength = Math.round((22050 * pauseMs) / 1000) * 2;
    expect(audio.byteLength).toBe(4 + silenceByteLength);
  });

  it("aborts the engine when the client cancels the audio stream", async () => {
    let observedSignal: AbortSignal | undefined;
    let markSynthesisWaiting: (() => void) | undefined;
    const synthesisWaiting = new Promise<void>((resolve) => {
      markSynthesisWaiting = resolve;
    });
    const engine: SpeechSynthesisEngine = {
      async *synthesize(_request, signal) {
        yield new Uint8Array([1, 2]);
        await new Promise<void>((resolve) => {
          observedSignal = signal;
          markSynthesisWaiting?.();
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    };
    const app = createSpeechApp(sttEngine, { ttsEngine: engine });
    const response = await app.request("/api/speech/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The TTS response stream is unavailable.");
    await reader.read();
    await synthesisWaiting;

    await reader.cancel("barge-in");

    expect(observedSignal?.aborted).toBe(true);
  });
});
