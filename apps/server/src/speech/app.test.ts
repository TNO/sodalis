import { describe, expect, it, vi } from "vitest";
import { createSpeechApp } from "./app.js";
import type { SpeechRecognitionEngine } from "./WhisperCppHttpEngine.js";
import type { StreamingSpeechRecognitionEngine } from "./StreamingRecognition.js";
import {
  AzureRealtimeSttEngine,
  type RecognizerEvents,
} from "./AzureRealtimeSttEngine.js";

function createEngine(
  transcribe: SpeechRecognitionEngine["transcribe"] = vi.fn(async () => ({
    text: "Waar is mijn afspraak?",
  })),
): SpeechRecognitionEngine {
  return { transcribe };
}

function createStreamingEngine() {
  const fake = {
    started: [] as { language: string; mimeType: string }[],
    written: [] as Uint8Array[],
    hypothesis: "",
    cancelled: 0,
    failure: undefined as Error | undefined,
    engine: undefined as unknown as StreamingSpeechRecognitionEngine,
  };
  const check = () => {
    if (fake.failure) throw fake.failure;
  };
  fake.engine = {
    provider: "azure",
    cloud: true,
    partialIntervalMs: 250,
    startSession(config) {
      fake.started.push({ language: config.language, mimeType: config.mimeType });
      return {
        write(chunk) {
          check();
          fake.written.push(chunk);
        },
        partialText() {
          check();
          return fake.hypothesis;
        },
        async finish() {
          if (fake.failure) {
            fake.cancelled += 1;
            throw fake.failure;
          }
          return { text: "Hoe oud bent u?" };
        },
        cancel() {
          fake.cancelled += 1;
        },
      };
    },
  };
  return fake;
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
  it("returns source-word timings only for providers that support alignment", async () => {
    const transcribeWithWordTimestamps = vi.fn(async (_request, sourceText: string) => ({
      text: "Hello, world.",
      wordTimestamps: [
        { word: sourceText.split(" ")[0]!, start: 0, end: 0.4 },
        { word: "world", start: 0.5, end: 0.9 },
      ],
    }));
    const engine = {
      transcribe: vi.fn(async () => ({ text: "Hello, world." })),
      transcribeWithWordTimestamps,
    };
    const app = createSpeechApp(engine);
    const form = new FormData();
    form.set("sourceText", "Hello world");
    form.set("language", "en-US");
    form.set(
      "audio",
      new Blob([new Uint8Array([1, 2])], { type: "audio/wav" }),
      "reply.wav",
    );

    const response = await app.request("/api/speech/stt/align", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "Hello, world.",
      wordTimestamps: [
        { word: "Hello", start: 0, end: 0.4 },
        { word: "world", start: 0.5, end: 0.9 },
      ],
    });
    expect(transcribeWithWordTimestamps).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "audio/wav",
        language: "en-US",
        audio: new Uint8Array([1, 2]),
      }),
      "Hello world",
    );
  });

  it("keeps text-only providers unchanged and rejects malformed alignment requests", async () => {
    const engine = createEngine();
    const app = createSpeechApp(engine);
    const unsupported = await app.request("/api/speech/stt/align", {
      method: "POST",
    });
    const timestampEngine = {
      transcribe: vi.fn(async () => ({ text: "text only" })),
      transcribeWithWordTimestamps: vi.fn(async () => ({
        text: "text only",
        wordTimestamps: [],
      })),
    };
    const timestampApp = createSpeechApp(timestampEngine);
    const wrongContentType = await timestampApp.request(
      "/api/speech/stt/align",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    const malformedForm = new FormData();
    malformedForm.set("language", "nl-NL");
    const missingSourceText = await timestampApp.request(
      "/api/speech/stt/align",
      {
        method: "POST",
        body: malformedForm,
      },
    );
    const session = await createSession(app);

    expect(unsupported.status).toBe(503);
    expect(wrongContentType.status).toBe(415);
    expect(missingSourceText.status).toBe(400);
    expect(session.status).toBe(201);
  });

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

  it("streams audio to a live recognizer and serves its latest hypothesis as the interim transcript", async () => {
    const fake = createStreamingEngine();
    const app = createSpeechApp(fake.engine);
    await expect((await createSession(app)).json()).resolves.toEqual({
      sessionId: "turn-1",
      partialIntervalMs: 250,
      provider: "azure",
      cloud: true,
    });
    expect(fake.started).toEqual([]);

    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([1, 2]),
    });
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([3]),
    });
    expect(fake.started).toEqual([{ language: "nl-NL", mimeType: "audio/webm" }]);
    expect(fake.written).toEqual([new Uint8Array([1, 2]), new Uint8Array([3])]);

    fake.hypothesis = "Hoe oud";
    const partial = await app.request(
      "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
    );
    await expect(partial.json()).resolves.toEqual({ text: "Hoe oud" });

    const final = await app.request(
      "/api/speech/stt/sessions/turn-1/finish", { method: "POST" },
    );
    await expect(final.json()).resolves.toEqual({ text: "Hoe oud bent u?" });
    expect(fake.cancelled).toBe(0);
    expect((await app.request(
      "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
    )).status).toBe(404);
  });

  it("stops the live recognizer when a streaming session is cancelled or expires", async () => {
    let clock = 0;
    const fake = createStreamingEngine();
    const app = createSpeechApp(fake.engine, { now: () => clock, sessionTtlMs: 1000 });
    for (const id of ["cancelled", "expired"]) {
      await createSession(app, id);
      await app.request(`/api/speech/stt/sessions/${id}/audio`, {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: new Uint8Array([1]),
      });
    }

    await app.request("/api/speech/stt/sessions/cancelled", { method: "DELETE" });
    expect(fake.cancelled).toBe(1);
    clock = 2000;
    await createSession(app, "next");
    expect(fake.cancelled).toBe(2);
    expect((await app.request(
      "/api/speech/stt/sessions/expired/finish", { method: "POST" },
    )).status).toBe(404);
  });

  it("does not start a live recognizer for a session cancelled while its first chunk uploads", async () => {
    const fake = createStreamingEngine();
    const app = createSpeechApp(fake.engine);
    await createSession(app);
    let sendBody!: (bytes: Uint8Array) => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        sendBody = (bytes) => {
          controller.enqueue(bytes);
          controller.close();
        };
      },
    });
    const upload = app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body,
      duplex: "half",
    } as RequestInit);

    await app.request("/api/speech/stt/sessions/turn-1", { method: "DELETE" });
    sendBody(new Uint8Array([1]));
    expect((await upload).status).toBe(404);
    expect(fake.started).toEqual([]);
  });

  it("closes a live recognizer whose client stops sending audio for 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      const fake = createStreamingEngine();
      const app = createSpeechApp(fake.engine);
      await createSession(app);
      const sendAudio = () => app.request("/api/speech/stt/sessions/turn-1/audio", {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: new Uint8Array([1]),
      });
      await sendAudio();
      await vi.advanceTimersByTimeAsync(20_000);
      await sendAudio();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(fake.cancelled).toBe(0);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(fake.cancelled).toBe(1);
      expect((await app.request(
        "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
      )).status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the transcript recognized before the 30 second cap through the public routes", async () => {
    let events!: RecognizerEvents;
    const sentPcm: number[] = [];
    const engine = new AzureRealtimeSttEngine({
      endpoint: "https://soladis-foundry.cognitiveservices.azure.com/",
      key: "example-key",
      createRecognizer: (_config, recognizerEvents) => {
        events = recognizerEvents;
        return {
          write: (pcm) => sentPcm.push(pcm.byteLength),
          endAudio: () => {
            events.recognized("Een lang verhaal.");
            events.stopped();
          },
          close: async () => undefined,
        };
      },
      createTranscoder: ({ onPcm }) => ({
        write: (chunk) => onPcm(new Uint8Array(chunk.byteLength * 1000)),
        end: async () => undefined,
        kill: () => undefined,
      }),
    });
    const app = createSpeechApp(engine);
    await createSession(app);
    for (let chunk = 0; chunk < 40; chunk += 1) {
      const uploaded = await app.request("/api/speech/stt/sessions/turn-1/audio", {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: new Uint8Array(32),
      });
      expect(uploaded.status).toBe(200);
    }

    expect(sentPcm.reduce((total, bytes) => total + bytes, 0)).toBe(30 * 16000 * 2);
    const final = await app.request(
      "/api/speech/stt/sessions/turn-1/finish", { method: "POST" },
    );
    await expect(final.json()).resolves.toEqual({ text: "Een lang verhaal." });
  });

  it("reports live recognizer failures as server errors", async () => {
    const fake = createStreamingEngine();
    const app = createSpeechApp(fake.engine);
    await createSession(app);
    await app.request("/api/speech/stt/sessions/turn-1/audio", {
      method: "POST",
      headers: { "content-type": "audio/webm" },
      body: new Uint8Array([1]),
    });
    fake.failure = new Error("Azure STT rejected the key.");

    const partial = await app.request(
      "/api/speech/stt/sessions/turn-1/partial", { method: "POST" },
    );
    expect(partial.status).toBe(502);
    await expect(partial.json()).resolves.toEqual({ error: "Azure STT rejected the key." });
    const final = await app.request(
      "/api/speech/stt/sessions/turn-1/finish", { method: "POST" },
    );
    expect(final.status).toBe(502);
    expect(fake.cancelled).toBe(1);
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
