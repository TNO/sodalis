import type {
  SpeechRecognitionEngine,
  SpeechRecognitionRequest,
  SpeechRecognitionResult,
} from "./WhisperCppHttpEngine.js";

export interface AzureSttEngineOptions {
  readonly endpoint: string;
  readonly key: string;
  readonly fetch?: typeof fetch;
}

const ENDPOINT_ERROR =
  "AZURE_STT_URL must be an HTTPS Azure /speechtotext/transcriptions:transcribe endpoint with an api-version.";
const SUPPORTED_LOCALES: Readonly<Record<string, string>> = {
  "nl-nl": "nl-NL",
  "en-us": "en-US",
};
const AUDIO_FILENAMES: Readonly<Record<string, string>> = {
  "audio/webm": "speech.webm",
  "audio/ogg": "speech.ogg",
  "audio/wav": "speech.wav",
  "audio/mp4": "speech.m4a",
  "audio/mpeg": "speech.mp3",
};

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** Azure AI Speech fast transcription; one upload per finished utterance. */
export class AzureSttEngine implements SpeechRecognitionEngine {
  readonly partialResults = false;
  private readonly endpoint: string;
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AzureSttEngineOptions) {
    let endpoint: URL;
    try {
      endpoint = new URL(options.endpoint);
    } catch {
      throw new Error(ENDPOINT_ERROR);
    }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
        endpoint.hash || !endpoint.pathname.endsWith("/speechtotext/transcriptions:transcribe") ||
        !endpoint.searchParams.get("api-version")) {
      throw new Error(ENDPOINT_ERROR);
    }
    if (!options.key.trim()) throw new Error("AZURE_STT_KEY is required.");
    this.endpoint = endpoint.toString();
    this.key = options.key;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult> {
    request.signal.throwIfAborted();
    const locale = SUPPORTED_LOCALES[request.language.toLowerCase()];
    if (!locale) throw new Error(`Azure STT does not support "${request.language}".`);
    const form = new FormData();
    form.append(
      "audio",
      new Blob([copyToArrayBuffer(request.audio)], { type: request.mimeType }),
      AUDIO_FILENAMES[request.mimeType] ?? "speech.webm",
    );
    form.append("definition", JSON.stringify({ locales: [locale] }));
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": this.key },
      body: form,
      signal: request.signal,
    });
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const detail = azureErrorMessage(payload)?.replace(/\.$/, "");
      throw new Error(
        `Azure STT returned HTTP ${response.status}${detail ? `: ${this.redact(detail)}` : ""}.`,
      );
    }
    if (typeof payload !== "object" || payload === null ||
        !("combinedPhrases" in payload) || !Array.isArray(payload.combinedPhrases)) {
      throw new Error("Azure STT returned an invalid transcript.");
    }
    const [phrase]: unknown[] = payload.combinedPhrases;
    if (phrase === undefined) return { text: "" };
    if (typeof phrase !== "object" || phrase === null ||
        !("text" in phrase) || typeof phrase.text !== "string") {
      throw new Error("Azure STT returned an invalid transcript.");
    }
    return { text: phrase.text.trim() };
  }

  private redact(message: string): string {
    return message.split(this.key).join("[redacted]").slice(0, 500);
  }
}

function azureErrorMessage(payload: unknown): string | undefined {
  const error = typeof payload === "object" && payload !== null && "error" in payload
    ? payload.error : payload;
  if (typeof error !== "object" || error === null) return undefined;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string"
    ? error.message : "";
  return [code, message].filter(Boolean).join(": ") || undefined;
}
