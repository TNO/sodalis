import type { SpeechRequest } from "@sodalis/speech";
import type { SpeechSynthesisEngine } from "./PiperTtsEngine.js";

export interface AzureTtsEngineOptions {
  readonly endpoint: string;
  readonly key: string;
  readonly voice: string;
  readonly fetch?: typeof fetch;
}

function xmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

export class AzureTtsEngine implements SpeechSynthesisEngine {
  readonly voiceId: string;
  private readonly endpoint: string;
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AzureTtsEngineOptions) {
    const endpoint = new URL(options.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
        endpoint.hash || !endpoint.pathname.endsWith("/cognitiveservices/v1")) {
      throw new Error("AZURE_TTS_URL must be an HTTPS Azure TTS /cognitiveservices/v1 endpoint.");
    }
    if (!options.key.trim()) throw new Error("AZURE_TTS_KEY is required.");
    if (!/^nl-(?:NL|BE)-[A-Za-z0-9]+Neural$/.test(options.voice)) {
      throw new Error("AZURE_TTS_VOICE must name a Dutch Azure neural voice.");
    }
    this.endpoint = endpoint.toString();
    this.key = options.key;
    this.voiceId = options.voice;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *synthesize(request: SpeechRequest, signal: AbortSignal): AsyncIterable<Uint8Array> {
    signal.throwIfAborted();
    if (!request.text.trim() || request.language !== this.voiceId.slice(0, 5) ||
        (request.voice && request.voice !== this.voiceId)) {
      throw new Error("Azure TTS does not support the requested language or voice.");
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "raw-22050hz-16bit-mono-pcm",
        "User-Agent": "Sodalis",
      },
      body: `<speak version="1.0" xml:lang="${request.language}"><voice name="${this.voiceId}">${xmlText(request.text)}</voice></speak>`,
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`Azure TTS returned HTTP ${response.status}.`);
    if (!response.body) throw new Error("Azure TTS returned no audio stream.");
    const reader = response.body.getReader();
    const onAbort = () => { void reader.cancel(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    let trailingByte: number | undefined;
    let bytesReceived = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        bytesReceived += value.byteLength;
        if (!value.byteLength) continue;
        const data = trailingByte === undefined
          ? value : new Uint8Array(value.byteLength + 1);
        if (trailingByte !== undefined) {
          data[0] = trailingByte;
          data.set(value, 1);
        }
        const evenLength = data.byteLength & ~1;
        trailingByte = evenLength < data.byteLength ? data[evenLength] : undefined;
        if (evenLength) yield data.subarray(0, evenLength);
      }
      if (!bytesReceived) throw new Error("Azure TTS returned empty audio.");
      if (trailingByte !== undefined) throw new Error("Azure TTS returned incomplete PCM audio.");
    } finally {
      signal.removeEventListener("abort", onAbort);
      await reader.cancel();
      reader.releaseLock();
    }
  }
}
