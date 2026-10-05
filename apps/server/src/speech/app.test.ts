import { describe, expect, it, vi } from "vitest";
import { createSpeechApp } from "./app.js";
import type { SpeechRecognitionEngine } from "./WhisperCppHttpEngine.js";

function createEngine(
  transcribe: SpeechRecognitionEngine["transcribe"] = vi.fn(async () => ({
    text: "Waar is mijn afspraak?",
  })),
): SpeechRecognitionEngine {
  return { transcribe };
}

async function createSession(
  app: ReturnType<typeof createSpeechApp>,
  sessionId = "turn-1",
  language = "nl-NL",
): Promise<Response> {
  return app.request("/api/speech/stt/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, language }),
  });
}

describe("speech recognition API", () => {
  it("reports speech health and readiness independently", async () => {
    const app = createSpeechApp(createEngine());
    expect((await (await app.request("/healthz")).json())).toEqual({
      status: "ok",
      service: "speech",
    });
    expect((await (await app.request("/readyz")).json())).toEqual({
      status: "ready",
      service: "speech",
    });
    expect((await app.request("/api/assistant/turns")).status).toBe(404);
  });

  it("buffers bounded audio and returns the engine's final transcript", async () => {
    const engine = createEngine();
    const app = createSpeechApp(engine, { maxAudioBytes: 8 });
    const created = await createSession(app);
    expect(created.status).toBe(201);

    const audio = new Uint8Array([1, 2, 3, 4]);
    const uploaded = await app.request(
      "/api/speech/stt/sessions/turn-1/audio",
      {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: audio,
      },
    );
    expect(uploaded.status).toBe(200);

    const finished = await app.request(
      "/api/speech/stt/sessions/turn-1/finish",
      { method: "POST" },
    );
    expect(finished.status).toBe(200);
    await expect(finished.json()).resolves.toEqual({
      text: "Waar is mijn afspraak?",
    });

    expect(engine.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        audio,
        mimeType: "audio/webm",
        language: "nl-NL",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns a transcript before finish while preserving the session for more audio", async () => {
    const engine = createEngine(vi.fn()
      .mockResolvedValueOnce({ text: "Hoe oud" })
      .mockResolvedValueOnce({ text: "Hoe oud bent u?" }));
    const app = createSpeechApp(engine);
    await createSession(app);
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([1, 2]),
    });

    const partial = await app.request(
      "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
    );
    expect(partial.status).toBe(200);
    await expect(partial.json()).resolves.toEqual({ text: "Hoe oud" });
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([3]),
    });
    const final = await app.request(
      "/api/speech/stt/sessions/turn-1/finish", { method: "POST" },
    );
    await expect(final.json()).resolves.toEqual({ text: "Hoe oud bent u?" });
    expect(engine.transcribe).toHaveBeenNthCalledWith(1, expect.objectContaining({
      audio: new Uint8Array([1, 2]),
    }));
    expect(engine.transcribe).toHaveBeenNthCalledWith(2, expect.objectContaining({
      audio: new Uint8Array([1, 2, 3]),
    }));
  });

  it("aborts an in-progress interim transcription when the session is cancelled", async () => {
    let started: (() => void) | undefined;
    let recognitionSignal: AbortSignal | undefined;
    const engine = createEngine(vi.fn(({ signal }) =>
      new Promise<{ text: string }>((_resolve, reject) => {
        recognitionSignal = signal;
        started?.();
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    ));
    const app = createSpeechApp(engine);
    await createSession(app);
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([1]),
    });
    const recognitionStarted = new Promise<void>((resolve) => { started = resolve; });
    const partial = app.request(
      "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
    );
    await recognitionStarted;
    expect((await app.request(
      "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
    )).status).toBe(409);
    expect((await app.request(
      "/api/speech/stt/sessions/turn-1", { method: "DELETE" },
    )).status).toBe(200);
    expect(recognitionSignal?.aborted).toBe(true);
    expect((await partial).status).toBe(502);
  });

  it("validates language and session IDs before allocating memory", async () => {
    const app = createSpeechApp(createEngine());

    const unsupportedLanguage = await createSession(
      app,
      "turn-bad",
      "fr-FR",
    );
    const malformedId = await createSession(app, "../bad");

    expect(unsupportedLanguage.status).toBe(400);
    expect(malformedId.status).toBe(400);
  });

  it("enforces accepted audio types and the per-session byte limit", async () => {
    const app = createSpeechApp(createEngine(), { maxAudioBytes: 3 });
    await createSession(app);

    const unsupported = await app.request(
      "/api/speech/stt/sessions/turn-1/audio",
      {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "no",
      },
    );
    const oversized = await app.request(
      "/api/speech/stt/sessions/turn-1/audio",
      {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: new Uint8Array([1, 2, 3, 4]),
      },
    );

    expect(unsupported.status).toBe(415);
    expect(oversized.status).toBe(413);
  });

  it("removes cancelled sessions and fails requests using stale IDs", async () => {
    const app = createSpeechApp(createEngine());
    await createSession(app);

    const cancelled = await app.request(
      "/api/speech/stt/sessions/turn-1",
      { method: "DELETE" },
    );
    const upload = await app.request(
      "/api/speech/stt/sessions/turn-1/audio",
      {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: new Uint8Array([1]),
      },
    );

    expect(cancelled.status).toBe(200);
    expect(upload.status).toBe(404);
  });

  it("aborts an in-progress recognition when its session is cancelled", async () => {
    let recognitionStarted: (() => void) | undefined;
    let recognitionSignal: AbortSignal | undefined;
    const engine = createEngine(
      vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<{ text: string }>((_resolve, reject) => {
            recognitionSignal = signal;
            recognitionStarted?.();
            signal.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true },
            );
          }),
      ),
    );
    const app = createSpeechApp(engine);
    await createSession(app);
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([1]),
    });
    const started = new Promise<void>((resolve) => {
      recognitionStarted = resolve;
    });
    const finishing = app.request(
      "/api/speech/stt/sessions/turn-1/finish",
      { method: "POST" },
    );
    await started;

    const cancelled = await app.request(
      "/api/speech/stt/sessions/turn-1",
      { method: "DELETE" },
    );
    const finishResponse = await finishing;

    expect(cancelled.status).toBe(200);
    expect(recognitionSignal?.aborted).toBe(true);
    expect(finishResponse.status).toBe(502);
  });

  it("translates recognition failures into a server error and clears the session", async () => {
    const engine = createEngine(
      vi.fn(async () => {
        throw new Error("Whisper is offline.");
      }),
    );
    const app = createSpeechApp(engine);
    await createSession(app);
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([1, 2]),
    });

    const failed = await app.request(
      "/api/speech/stt/sessions/turn-1/finish",
      { method: "POST" },
    );
    const retry = await app.request(
      "/api/speech/stt/sessions/turn-1/finish",
      { method: "POST" },
    );

    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toEqual({
      error: "Whisper is offline.",
    });
    expect(retry.status).toBe(404);
  });
});
