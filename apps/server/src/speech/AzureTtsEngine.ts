import { isSpeechRate, type SpeechRequest } from "@sodalis/speech";
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

/** An Azure voice short name, optionally with a model suffix such as `:DragonHDLatestNeural`. */
const AZURE_VOICE = /^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9]+(?::[A-Za-z0-9.-]+)?$/;

/** The text-to-speech URL for a regional Speech endpoint or a Foundry resource endpoint. */
export function azureTtsEndpoint(value: string): string {
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("AZURE_TTS_URL must be an HTTPS URL without credentials.");
  }
  if (endpoint.hostname.endsWith(".services.ai.azure.com")) {
    throw new Error("AZURE_TTS_URL is a Foundry project endpoint, which has no speech route; use the " +
      "resource endpoint https://<resource>.cognitiveservices.azure.com/ instead.");
  }
  if (endpoint.hostname.endsWith(".cognitiveservices.azure.com") && ["", "/"].includes(endpoint.pathname)) {
    endpoint.pathname = "/tts/cognitiveservices/v1";
  }
  if (!endpoint.pathname.endsWith("/cognitiveservices/v1")) {
    throw new Error("AZURE_TTS_URL must be an Azure Speech resource or /cognitiveservices/v1 endpoint.");
  }
  return endpoint.toString();
}

export class AzureTtsEngine implements SpeechSynthesisEngine {
  readonly supportsRate: boolean;
  readonly voiceId: string;
  private readonly endpoint: string;
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AzureTtsEngineOptions) {
    this.endpoint = azureTtsEndpoint(options.endpoint);
    if (!options.key.trim()) throw new Error("AZURE_TTS_KEY is required.");
    if (!AZURE_VOICE.test(options.voice)) {
      throw new Error("AZURE_TTS_VOICE must be an Azure voice name such as nl-NL-FennaNeural or " +
        "en-US-Adam:DragonHDLatestNeural.");
    }
    this.key = options.key;
    this.voiceId = options.voice;
    this.supportsRate = !options.voice.includes(":");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *synthesize(request: SpeechRequest, signal: AbortSignal): AsyncIterable<Uint8Array> {
    signal.throwIfAborted();
    if (request.rate !== undefined && !isSpeechRate(request.rate)) {
      throw new RangeError("Speech rate must be between 0.75 and 1.25.");
    }
    if (!request.text.trim() || !/^nl-(?:NL|BE)$/.test(request.language) ||
        (request.voice && request.voice !== this.voiceId)) {
      throw new Error("Azure TTS does not support the requested language or voice.");
    }
    // Multilingual voices from other locales speak Dutch only when the text is marked as Dutch.
    const text = this.voiceId.toLowerCase().startsWith("nl-")
      ? xmlText(request.text)
      : `<lang xml:lang="${request.language}">${xmlText(request.text)}</lang>`;
    const pacedText = !this.supportsRate || request.rate === undefined || request.rate === 1
      ? text
      : `<prosody rate="${Math.round((request.rate - 1) * 100)}%">${text}</prosody>`;
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "raw-22050hz-16bit-mono-pcm",
        "User-Agent": "Sodalis",
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${request.language}">` +
        `<voice name="${this.voiceId}">${pacedText}</voice></speak>`,
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`Azure TTS returned HTTP ${response.status}.`);
    if (!response.body) throw new Error("Azure TTS returned no audio stream.");
    const reader = response.body.getReader();
    // fetch errors the body when its signal aborts, so cancelling then rejects; an unhandled
    // rejection would crash the speech service on every barge-in.
    const onAbort = () => { reader.cancel(signal.reason).catch(() => undefined); };
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
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
