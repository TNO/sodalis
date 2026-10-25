import type { SpeechRequest } from "@sodalis/speech";
import { normalizeSpeechText } from "./speechTextNormalization.js";
import type { SpeechSynthesisEngine } from "./PiperTtsEngine.js";

export const POCKET_TTS_PCM_MIME_TYPE =
  "audio/pcm;rate=24000;bits=16;channels=1;endianness=little";

export interface PocketTtsHttpEngineOptions {
  readonly serverUrl: string;
  readonly apiKey: string;
  readonly voice: string;
  readonly fetch?: typeof fetch;
}

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException("Pocket TTS synthesis was cancelled.", "AbortError")
  );
}

export class PocketTtsHttpEngine implements SpeechSynthesisEngine {
  readonly mimeType = POCKET_TTS_PCM_MIME_TYPE;
  readonly sampleRate = 24_000;
  readonly voiceId: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: PocketTtsHttpEngineOptions) {
    const serverUrl = new URL(options.serverUrl);
    if (!["http:", "https:"].includes(serverUrl.protocol)) {
      throw new Error("Pocket TTS URL must use HTTP or HTTPS.");
    }
    if (!options.apiKey.trim()) {
      throw new Error("A Pocket TTS API key is required.");
    }
    if (!options.voice.trim()) {
      throw new Error("A Pocket TTS voice is required.");
    }
    this.endpoint = new URL("/v1/audio/speech", serverUrl).toString();
    this.apiKey = options.apiKey;
    this.voiceId = options.voice;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *synthesize(
    request: SpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array> {
    signal.throwIfAborted();
    if (
      !["nl-NL", "nl-BE"].includes(request.language) ||
      (request.voice !== undefined && request.voice !== this.voiceId)
    ) {
      throw new Error("Pocket TTS does not support the requested language or voice.");
    }

    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        accept: "audio/pcm",
      },
      body: JSON.stringify({
        input: normalizeSpeechText(request.text, request.language),
        voice: this.voiceId,
        response_format: "pcm",
        seed: 42,
      }),
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(
        `Pocket TTS returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      );
    }
    if (!response.body) throw new Error("Pocket TTS returned no audio stream.");
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("audio/pcm")) {
      throw new Error("Pocket TTS returned an unsupported audio format.");
    }

    const reader = response.body.getReader();
    let pendingByte: number | undefined;
    let receivedBytes = 0;
    const onAbort = () => {
      reader.cancel(signal.reason).catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        receivedBytes += value.byteLength;
        const chunk = new Uint8Array(
          value.byteLength + (pendingByte === undefined ? 0 : 1),
        );
        if (pendingByte !== undefined) chunk[0] = pendingByte;
        chunk.set(value, pendingByte === undefined ? 0 : 1);
        const alignedLength = chunk.byteLength - (chunk.byteLength % 2);
        if (alignedLength) yield chunk.subarray(0, alignedLength);
        pendingByte =
          alignedLength < chunk.byteLength
            ? chunk[chunk.byteLength - 1]
            : undefined;
      }
      if (!receivedBytes) throw new Error("Pocket TTS returned empty audio.");
      if (pendingByte !== undefined) {
        throw new Error("Pocket TTS returned incomplete PCM audio.");
      }
    } catch (error) {
      if (signal.aborted) throw abortReason(signal);
      throw error;
    } finally {
      signal.removeEventListener("abort", onAbort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
