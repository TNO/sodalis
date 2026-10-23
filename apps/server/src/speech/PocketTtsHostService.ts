import { Hono } from "hono";
import { POCKET_TTS_PCM_MIME_TYPE } from "./PocketTtsHttpEngine.js";

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_INPUT_LENGTH = 5000;
const POCKET_TTS_SAMPLE_TEXT = "Een korte test.";

export interface PocketTtsHostServiceOptions {
  readonly nativeServerUrl: string;
  readonly apiKey: string;
  readonly voice: string;
  readonly referenceWav: Uint8Array;
  readonly fetch?: typeof fetch;
}

function required(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function nativeEndpoint(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function copyResponse(response: Response, contentType?: string): Response {
  return new Response(response.body, {
    status: response.status,
    headers: {
      "cache-control": "no-store",
      "content-type": contentType ?? response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function createPocketTtsHostService(
  options: PocketTtsHostServiceOptions,
) {
  const nativeUrl = new URL(options.nativeServerUrl);
  if (
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(nativeUrl.hostname)
  ) {
    throw new Error("The Pocket TTS native server must be bound to loopback.");
  }
  const apiKey = required(options.apiKey, "POCKET_TTS_API_KEY");
  const voice = required(options.voice, "POCKET_TTS_VOICE");
  if (!options.referenceWav.byteLength) {
    throw new Error("The configured Pocket TTS reference WAV is empty.");
  }
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const voicesUrl = nativeEndpoint(
    options.nativeServerUrl,
    "/v1/audio/voices",
  );
  const speechUrl = nativeEndpoint(
    options.nativeServerUrl,
    "/v1/audio/speech",
  );

  const registration = await fetcher(voicesUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: voice,
      wav_b64: Buffer.from(options.referenceWav).toString("base64"),
    }),
  });
  if (!registration.ok) {
    throw new Error(
      `Pocket TTS reference registration failed with HTTP ${registration.status}.`,
    );
  }

  const warmup = await fetcher(speechUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/pcm" },
    body: JSON.stringify({
      input: POCKET_TTS_SAMPLE_TEXT,
      voice,
      response_format: "pcm",
      seed: 42,
    }),
  });
  if (!warmup.ok) {
    throw new Error(`Pocket TTS warm-up failed with HTTP ${warmup.status}.`);
  }
  const warmupAudio = new Uint8Array(await warmup.arrayBuffer());
  if (!warmupAudio.byteLength || warmupAudio.byteLength % 2 !== 0) {
    throw new Error("Pocket TTS warm-up returned invalid PCM audio.");
  }

  const app = new Hono();
  app.get("/healthz", (context) =>
    context.json({ status: "ok", service: "pocket-tts-host" }),
  );
  app.get("/readyz", (context) =>
    context.json({ status: "ready", service: "pocket-tts-host" }),
  );
  app.use("/v1/*", async (context, next) => {
    if (context.req.header("authorization") !== `Bearer ${apiKey}`) {
      return context.json({ error: "Pocket TTS authorization required." }, 401);
    }
    await next();
  });
  app.get("/v1/voices", async () => {
    const response = await fetcher(voicesUrl, { method: "GET" });
    return copyResponse(response);
  });
  app.get("/v1/capabilities", (context) =>
    context.json({
      provider: "pockettts.cpp",
      languages: ["nl-NL"],
      sampleRate: 24000,
      channels: 1,
      format: "pcm_s16le",
      streamingAudio: false,
      voiceCloning: true,
      voice,
    }),
  );
  app.post("/v1/audio/speech", async (context) => {
    if (
      (context.req.header("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return context.json({ error: "Request content type must be application/json." }, 415);
    }
    const reader = context.req.raw.body?.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          byteLength += value.byteLength;
          if (byteLength > MAX_REQUEST_BYTES) {
            await reader.cancel();
            return context.json({ error: "Speech request exceeds the size limit." }, 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const bodyBytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    if (typeof payload !== "object" || payload === null) {
      return context.json({ error: "Speech request is required." }, 400);
    }
    const input = "input" in payload ? payload.input : undefined;
    const requestedVoice = "voice" in payload ? payload.voice : undefined;
    const format = "response_format" in payload
      ? payload.response_format
      : "pcm";
    if (
      typeof input !== "string" ||
      !input.trim() ||
      input.length > MAX_INPUT_LENGTH
    ) {
      return context.json({ error: `Speech input must contain 1–${MAX_INPUT_LENGTH} characters.` }, 400);
    }
    if (requestedVoice !== undefined && requestedVoice !== voice) {
      return context.json({ error: `Voice must be ${voice}.` }, 400);
    }
    if (format !== "pcm") {
      return context.json({ error: 'response_format must be "pcm".' }, 400);
    }

    const response = await fetcher(speechUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "audio/pcm" },
      body: JSON.stringify({
        input,
        voice,
        response_format: "pcm",
        seed: 42,
      }),
      signal: context.req.raw.signal,
    });
    return copyResponse(
      response,
      response.ok ? POCKET_TTS_PCM_MIME_TYPE : undefined,
    );
  });
  return app;
}
