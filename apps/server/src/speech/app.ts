import { Hono, type Context } from "hono";
import type { SpeechRequest } from "@sodalis/speech";
import type {
  SpeechRecognitionEngine,
  WordTimestampSpeechRecognitionEngine,
} from "./WhisperCppHttpEngine.js";
import {
  isStreamingEngine,
  type StreamingRecognitionSession,
  type StreamingSpeechRecognitionEngine,
} from "./StreamingRecognition.js";
import {
  PIPER_PCM_MIME_TYPE,
  PIPER_VOICE_ID,
  type SpeechSynthesisEngine,
} from "./PiperTtsEngine.js";
import { markdownToSpeech } from "./markdownToSpeech.js";
import {
  clampSpeechChunkPauseMs,
  clampSpeechChunkSize,
  DEFAULT_TTS_CHUNK_CHARACTERS,
  DEFAULT_TTS_CHUNK_PAUSE_MS,
  splitSpeechText,
} from "./speechChunking.js";
import {
  detectSpeechOnset,
  shiftWordTimestamps,
  type SpeechOnsetDetector,
} from "./speechTimingRepair.js";
import { trimUnsupportedTranscriptTail } from "./speechWordAlignment.js";

interface RecognitionSession {
  readonly language: string;
  readonly createdAt: number;
  readonly chunks: Uint8Array[];
  mimeType: string;
  byteLength: number;
  processing: boolean;
  partialProcessing: boolean;
  abortController?: AbortController;
  stream?: StreamingRecognitionSession;
  idleTimer?: ReturnType<typeof setTimeout>;
}

export interface SpeechAppOptions {
  readonly maxAudioBytes?: number;
  readonly maxSessions?: number;
  readonly sessionTtlMs?: number;
  readonly now?: () => number;
  readonly ttsEngine?: SpeechSynthesisEngine;
  readonly maxTtsChunkCharacters?: number;
  readonly ttsChunkPauseMs?: number;
  readonly detectSpeechOnset?: SpeechOnsetDetector;
}

const DEFAULT_MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_SESSIONS = 8;
const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
/** Closes a live recognizer (and its cloud connection) after this much client silence. */
const STREAM_IDLE_TIMEOUT_MS = 30 * 1000;
const MAX_TTS_REQUESTS = 2;
const MAX_TTS_TEXT_LENGTH = 5000;
const MAX_TTS_REQUEST_BYTES = 16 * 1024;
const MAX_ALIGNMENT_REQUEST_OVERHEAD = 24 * 1024;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
  "audio/mpeg",
  "application/octet-stream",
]);

function jsonError(
  context: Context,
  message: string,
  status: 400 | 404 | 409 | 413 | 415 | 422 | 503 | 502,
) {
  return context.json({ error: message }, status);
}

function collectAudio(session: RecognitionSession): Uint8Array {
  const audio = new Uint8Array(session.byteLength);
  let offset = 0;
  for (const chunk of session.chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

class BodyLimitError extends Error {}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
  limitMessage = "Speech audio exceeds the size limit.",
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new BodyLimitError(limitMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const audio = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Speech recognition failed.";
}

function supportsWordTimestamps(
  engine: SpeechRecognitionEngine | StreamingSpeechRecognitionEngine,
): engine is WordTimestampSpeechRecognitionEngine {
  return (
    "transcribeWithWordTimestamps" in engine &&
    typeof engine.transcribeWithWordTimestamps === "function"
  );
}

export function createSpeechApp(
  engine: SpeechRecognitionEngine | StreamingSpeechRecognitionEngine,
  options: SpeechAppOptions = {},
) {
  const streaming = isStreamingEngine(engine) ? engine : undefined;
  const transcribeBuffered = (
    request: Parameters<SpeechRecognitionEngine["transcribe"]>[0],
  ) => {
    if (isStreamingEngine(engine)) {
      throw new Error("Streaming speech sessions are transcribed while audio arrives.");
    }
    return engine.transcribe(request);
  };
  const maxAudioBytes = options.maxAudioBytes ?? DEFAULT_MAX_AUDIO_BYTES;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const now = options.now ?? Date.now;
  const maxTtsChunkCharacters = clampSpeechChunkSize(
    options.maxTtsChunkCharacters ?? DEFAULT_TTS_CHUNK_CHARACTERS,
  );
  const ttsChunkPauseMs = clampSpeechChunkPauseMs(
    options.ttsChunkPauseMs ?? DEFAULT_TTS_CHUNK_PAUSE_MS,
  );
  const onsetDetector = options.detectSpeechOnset ?? detectSpeechOnset;
  const sessions = new Map<string, RecognitionSession>();
  let activeTtsRequests = 0;
  const app = new Hono();
  app.get("/healthz", (context) =>
    context.json({ status: "ok", service: "speech" }),
  );
  app.get("/readyz", (context) =>
    context.json({ status: "ready", service: "speech" }),
  );

  app.post("/api/speech/stt/align", async (context) => {
    if (!supportsWordTimestamps(engine)) {
      return jsonError(
        context,
        "Word timestamps are unavailable from the selected speech provider.",
        503,
      );
    }
    const contentType = context.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return jsonError(context, "Request content type must be multipart/form-data.", 415);
    }
    let body: Uint8Array;
    try {
      body = await readBoundedBody(
        context.req.raw,
        maxAudioBytes + MAX_ALIGNMENT_REQUEST_OVERHEAD,
        "Alignment request exceeds the size limit.",
      );
    } catch (error) {
      if (error instanceof BodyLimitError) {
        return jsonError(context, error.message, 413);
      }
      throw error;
    }
    let form: FormData;
    try {
      form = await new Request(context.req.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: copyToArrayBuffer(body),
      }).formData();
    } catch {
      return jsonError(context, "Alignment request must be valid multipart data.", 400);
    }
    const sourceText = form.get("sourceText");
    const language = form.get("language");
    const audio = form.get("audio");
    if (
      typeof sourceText !== "string" ||
      !sourceText.trim() ||
      sourceText.length > MAX_TTS_TEXT_LENGTH
    ) {
      return jsonError(context, `Source text must contain 1–${MAX_TTS_TEXT_LENGTH} characters.`, 400);
    }
    if (
      typeof language !== "string" ||
      !LANGUAGE_PATTERN.test(language) ||
      !["nl-nl", "en-us"].includes(language.toLowerCase())
    ) {
      return jsonError(context, "Language must be nl-NL or en-US.", 400);
    }
    if (!(audio instanceof File) || !audio.size) {
      return jsonError(context, "A non-empty audio file is required.", 400);
    }
    if (audio.size > maxAudioBytes) {
      return jsonError(context, "Speech audio exceeds the size limit.", 413);
    }
    const mimeType = audio.type.split(";")[0]?.trim().toLowerCase();
    if (!mimeType || !ALLOWED_AUDIO_TYPES.has(mimeType)) {
      return jsonError(context, "Unsupported audio media type.", 415);
    }
    try {
      const audioBytes = new Uint8Array(await audio.arrayBuffer());
      const onset = await onsetDetector(
        audioBytes,
        mimeType,
        context.req.raw.signal,
      );
      if (onset.status === "all-silence") {
        return jsonError(context, "Audio contains no speech.", 422);
      }
      const result = await engine.transcribeWithWordTimestamps(
        {
          audio: audioBytes,
          mimeType,
          language,
          signal: context.req.raw.signal,
        },
        sourceText,
      );
      return context.json({
        text: trimUnsupportedTranscriptTail(sourceText, result.text),
        wordTimestamps: shiftWordTimestamps(
          result.wordTimestamps,
          onset.onsetSeconds,
        ),
      });
    } catch (error) {
      return jsonError(context, errorMessage(error), 502);
    }
  });

  const closeSession = (id: string, session: RecognitionSession) => {
    clearTimeout(session.idleTimer);
    session.stream?.cancel();
    if (sessions.get(id) === session) sessions.delete(id);
  };
  const touchStream = (id: string, session: RecognitionSession) => {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      if (!session.processing) closeSession(id, session);
    }, STREAM_IDLE_TIMEOUT_MS);
    session.idleTimer.unref?.();
  };

  const removeExpiredSessions = () => {
    const cutoff = now() - sessionTtlMs;
    for (const [id, session] of sessions) {
      if (session.createdAt < cutoff && !session.processing && !session.partialProcessing) {
        closeSession(id, session);
      }
    }
  };

  app.post("/api/speech/stt/sessions", async (context) => {
    removeExpiredSessions();
    let payload: unknown;
    try {
      payload = await context.req.json();
    } catch {
      return jsonError(context, "Request body must be valid JSON.", 400);
    }
    if (typeof payload !== "object" || payload === null) {
      return jsonError(context, "Session configuration is required.", 400);
    }
    const sessionId = "sessionId" in payload ? payload.sessionId : undefined;
    const language = "language" in payload ? payload.language : undefined;
    if (
      typeof sessionId !== "string" ||
      !SESSION_ID_PATTERN.test(sessionId)
    ) {
      return jsonError(context, "A valid session ID is required.", 400);
    }
    if (
      typeof language !== "string" ||
      !LANGUAGE_PATTERN.test(language) ||
      !["nl-nl", "en-us"].includes(language.toLowerCase())
    ) {
      return jsonError(context, "Language must be nl-NL or en-US.", 400);
    }
    if (sessions.has(sessionId)) {
      return jsonError(context, "Speech session already exists.", 409);
    }
    if (sessions.size >= maxSessions) {
      return jsonError(context, "Speech server is at session capacity.", 503);
    }
    sessions.set(sessionId, {
      language,
      createdAt: now(),
      chunks: [],
      mimeType: "application/octet-stream",
      byteLength: 0,
      processing: false,
      partialProcessing: false,
    });
    return context.json(
      streaming
        ? {
            sessionId,
            partialIntervalMs: streaming.partialIntervalMs,
            provider: streaming.provider,
            cloud: streaming.cloud,
          }
        : { sessionId },
      201,
    );
  });

  app.post("/api/speech/stt/sessions/:sessionId/audio", async (context) => {
    const session = sessions.get(context.req.param("sessionId"));
    if (!session) return jsonError(context, "Speech session not found.", 404);
    if (session.processing) {
      return jsonError(context, "Speech session is already processing.", 409);
    }
    const mimeType = (context.req.header("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
      return jsonError(context, "Unsupported audio media type.", 415);
    }
    const contentLength = Number(context.req.header("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > maxAudioBytes - session.byteLength
    ) {
      return jsonError(context, "Speech audio exceeds the size limit.", 413);
    }
    let audio: Uint8Array;
    try {
      audio = await readBoundedBody(
        context.req.raw,
        maxAudioBytes - session.byteLength,
      );
    } catch (error) {
      if (error instanceof BodyLimitError) {
        return jsonError(context, error.message, 413);
      }
      throw error;
    }
    if (!audio.byteLength) {
      return jsonError(context, "Audio chunks must not be empty.", 400);
    }
    if (audio.byteLength > maxAudioBytes - session.byteLength) {
      return jsonError(context, "Speech audio exceeds the size limit.", 413);
    }
    const sessionId = context.req.param("sessionId");
    if (sessions.get(sessionId) !== session) {
      return jsonError(context, "Speech session not found.", 404);
    }
    if (session.processing) {
      return jsonError(context, "Speech session is already processing.", 409);
    }
    if (streaming) {
      touchStream(sessionId, session);
      try {
        session.stream ??= streaming.startSession({
          language: session.language,
          mimeType,
        });
        session.stream.write(audio);
      } catch (error) {
        return jsonError(context, errorMessage(error), 502);
      }
    } else {
      session.chunks.push(audio);
    }
    session.byteLength += audio.byteLength;
    session.mimeType = mimeType;
    return context.json({ acceptedBytes: session.byteLength });
  });

  app.post("/api/speech/stt/sessions/:sessionId/partial", async (context) => {
    const session = sessions.get(context.req.param("sessionId"));
    if (!session) return jsonError(context, "Speech session not found.", 404);
    if (session.stream) {
      touchStream(context.req.param("sessionId"), session);
      try {
        return context.json({ text: session.stream.partialText() });
      } catch (error) {
        return jsonError(context, errorMessage(error), 502);
      }
    }
    if (session.processing || session.partialProcessing) {
      return jsonError(context, "Speech session is already processing.", 409);
    }
    if (!session.byteLength) {
      return jsonError(context, "Speech session contains no audio.", 400);
    }
    session.partialProcessing = true;
    const abortController = new AbortController();
    session.abortController = abortController;
    const requestSignal = context.req.raw.signal;
    const onRequestAbort = () => abortController.abort(requestSignal.reason);
    requestSignal.addEventListener("abort", onRequestAbort, { once: true });
    if (requestSignal.aborted) onRequestAbort();
    try {
      const result = await transcribeBuffered({
        audio: collectAudio(session),
        mimeType: session.mimeType,
        language: session.language,
        signal: abortController.signal,
      });
      return context.json({ text: result.text });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Speech recognition failed.";
      return jsonError(context, message, 502);
    } finally {
      requestSignal.removeEventListener("abort", onRequestAbort);
      session.partialProcessing = false;
      session.abortController = undefined;
    }
  });

  app.post("/api/speech/stt/sessions/:sessionId/finish", async (context) => {
    const sessionId = context.req.param("sessionId");
    const session = sessions.get(sessionId);
    if (!session) return jsonError(context, "Speech session not found.", 404);
    if (session.processing || session.partialProcessing) {
      return jsonError(context, "Speech session is already processing.", 409);
    }
    if (!session.byteLength) {
      sessions.delete(sessionId);
      return jsonError(context, "Speech session contains no audio.", 400);
    }

    session.processing = true;
    clearTimeout(session.idleTimer);
    const abortController = new AbortController();
    session.abortController = abortController;
    const requestSignal = context.req.raw.signal;
    const onRequestAbort = () => abortController.abort(requestSignal.reason);
    requestSignal.addEventListener("abort", onRequestAbort, { once: true });
    if (requestSignal.aborted) onRequestAbort();
    const stream = session.stream;
    const cancelStream = () => stream?.cancel();
    abortController.signal.addEventListener("abort", cancelStream, { once: true });
    try {
      const result = stream
        ? await stream.finish()
        : await transcribeBuffered({
            audio: collectAudio(session),
            mimeType: session.mimeType,
            language: session.language,
            signal: abortController.signal,
          });
      return context.json({ text: result.text });
    } catch (error) {
      return jsonError(context, errorMessage(error), 502);
    } finally {
      requestSignal.removeEventListener("abort", onRequestAbort);
      abortController.signal.removeEventListener("abort", cancelStream);
      sessions.delete(sessionId);
    }
  });

  app.delete("/api/speech/stt/sessions/:sessionId", (context) => {
    const sessionId = context.req.param("sessionId");
    const session = sessions.get(sessionId);
    if (session?.processing || session?.partialProcessing) {
      session.abortController?.abort(
        new DOMException("Speech recognition was cancelled.", "AbortError"),
      );
    } else if (session) {
      closeSession(sessionId, session);
    }
    sessions.delete(sessionId);
    return context.json({ cancelled: true });
  });

  app.post("/api/speech/tts", async (context) => {
    const engine = options.ttsEngine;
    if (!engine) return jsonError(context, "TTS is not configured.", 503);
    if (
      (context.req.header("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return jsonError(context, "Request content type must be application/json.", 415);
    }

    let rawBody: Uint8Array;
    try {
      rawBody = await readBoundedBody(
        context.req.raw,
        MAX_TTS_REQUEST_BYTES,
        "Speech request exceeds the size limit.",
      );
    } catch (error) {
      if (error instanceof BodyLimitError) {
        return jsonError(context, error.message, 413);
      }
      throw error;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return jsonError(context, "Request body must be valid JSON.", 400);
    }
    if (typeof payload !== "object" || payload === null) {
      return jsonError(context, "Speech request is required.", 400);
    }

    const sessionId = "sessionId" in payload ? payload.sessionId : undefined;
    const speechId = "speechId" in payload ? payload.speechId : undefined;
    const text = "text" in payload ? payload.text : undefined;
    const language = "language" in payload ? payload.language : undefined;
    const voice = "voice" in payload ? payload.voice : undefined;
    if (
      typeof sessionId !== "string" ||
      !SESSION_ID_PATTERN.test(sessionId) ||
      typeof speechId !== "string" ||
      !SESSION_ID_PATTERN.test(speechId)
    ) {
      return jsonError(context, "Valid session and speech IDs are required.", 400);
    }
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_TTS_TEXT_LENGTH
    ) {
      return jsonError(
        context,
        `Speech text must contain 1–${MAX_TTS_TEXT_LENGTH} characters.`,
        400,
      );
    }
    if (language !== "nl-NL" && language !== "nl-BE") {
      return jsonError(context, "Language must be nl-NL or nl-BE.", 400);
    }
    const configuredVoice = engine.voiceId ?? PIPER_VOICE_ID;
    if (voice !== undefined && voice !== configuredVoice) {
      return jsonError(context, `Voice must be ${configuredVoice}.`, 400);
    }
    if (activeTtsRequests >= MAX_TTS_REQUESTS) {
      return jsonError(context, "Speech server is at TTS capacity.", 503);
    }

    const cleanedText = markdownToSpeech(text);
    if (!cleanedText) {
      return jsonError(context, "Speech text must not be empty after cleanup.", 400);
    }
    const chunks = splitSpeechText(cleanedText, maxTtsChunkCharacters);
    const speechRequest: SpeechRequest = {
      sessionId,
      speechId,
      text: cleanedText,
      language,
      ...(voice ? { voice } : {}),
    };
    const abortController = new AbortController();
    const requestSignal = context.req.raw.signal;
    const onRequestAbort = () =>
      abortController.abort(
        requestSignal.reason ??
          new DOMException("Speech synthesis was cancelled.", "AbortError"),
      );
    requestSignal.addEventListener("abort", onRequestAbort, { once: true });
    if (requestSignal.aborted) onRequestAbort();

    activeTtsRequests += 1;
    const body = new ReadableStream<Uint8Array>({
      async start(streamController) {
        try {
          for (const [index, textChunk] of chunks.entries()) {
            abortController.signal.throwIfAborted();
            if (index > 0 && ttsChunkPauseMs > 0) {
              const silenceSamples = Math.round(
                ((engine.sampleRate ?? 22_050) * ttsChunkPauseMs) / 1000,
              );
              streamController.enqueue(new Uint8Array(silenceSamples * 2));
            }
            for await (const audioChunk of engine.synthesize(
              { ...speechRequest, text: textChunk },
              abortController.signal,
            )) {
              abortController.signal.throwIfAborted();
              if (audioChunk.byteLength) streamController.enqueue(audioChunk);
            }
          }
          if (!abortController.signal.aborted) streamController.close();
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error(
              `Speech synthesis failed for "${sessionId}/${speechId}":`,
              error,
            );
            streamController.error(error);
          }
        } finally {
          requestSignal.removeEventListener("abort", onRequestAbort);
          activeTtsRequests -= 1;
        }
      },
      cancel(reason) {
        abortController.abort(
          reason ??
            new DOMException("Speech playback was cancelled.", "AbortError"),
        );
      },
    });

    return new Response(body, {
      headers: {
        "content-type": engine.mimeType ?? PIPER_PCM_MIME_TYPE,
        "cache-control": "no-store",
        "x-sodalis-session-id": sessionId,
        "x-sodalis-speech-id": speechId,
      },
    });
  });

  app.onError((error, context) => {
    console.error("Speech API request failed:", error);
    return context.json({ error: "Speech API request failed." }, 500);
  });
  return app;
}
