import type { SpeechRequest } from "@sodalis/speech";
import type { SpeechSynthesisEngine } from "./PiperTtsEngine.js";
import { PIPER_VOICE_ID } from "./PiperTtsEngine.js";

export interface PiperHttpEngineOptions {
  readonly serverUrl: string;
  readonly fetch?: typeof fetch;
}

export class PiperHttpEngine implements SpeechSynthesisEngine {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(options: PiperHttpEngineOptions) {
    this.endpoint = new URL("/", options.serverUrl).toString();
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *synthesize(request: SpeechRequest, signal: AbortSignal): AsyncIterable<Uint8Array> {
    signal.throwIfAborted();
    if (!["nl-NL", "nl-BE"].includes(request.language) ||
        (request.voice && request.voice !== PIPER_VOICE_ID)) {
      throw new Error("Piper HTTP does not support the requested language or voice.");
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "audio/wav" },
      body: JSON.stringify({ text: request.text }),
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`Piper HTTP returned HTTP ${response.status}.`);
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("audio/wav")) {
      throw new Error("Piper HTTP must return audio/wav.");
    }
    if (!response.body) throw new Error("Piper HTTP returned no audio stream.");
    const reader = response.body.getReader();
    const header = new Uint8Array(44);
    let headerLength = 0;
    const onAbort = () => { void reader.cancel(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        let offset = 0;
        if (headerLength < header.length) {
          const count = Math.min(header.length - headerLength, value.length);
          header.set(value.subarray(0, count), headerLength);
          headerLength += count;
          offset = count;
          if (headerLength === header.length) {
            const view = new DataView(header.buffer);
            const text = (start: number) =>
              String.fromCharCode(...header.subarray(start, start + 4));
            if (text(0) !== "RIFF" || text(8) !== "WAVE" ||
                text(12) !== "fmt " || view.getUint32(16, true) !== 16 ||
                view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
                view.getUint32(24, true) !== 22050 || view.getUint16(34, true) !== 16 ||
                text(36) !== "data") {
              throw new Error("Piper HTTP returned an unsupported WAV format; expected 22050 Hz mono PCM16.");
            }
          }
        }
        if (headerLength === header.length && offset < value.length) {
          yield value.subarray(offset);
        }
      }
      if (headerLength !== header.length) throw new Error("Piper HTTP returned incomplete WAV audio.");
    } finally {
      signal.removeEventListener("abort", onAbort);
      await reader.cancel();
      reader.releaseLock();
    }
  }
}
