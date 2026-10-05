import type {
  SpeechRecognitionEngine,
  SpeechRecognitionRequest,
  SpeechRecognitionResult,
} from "./WhisperCppHttpEngine.js";

export interface LocalSpeechHttpEngineOptions {
  readonly serverUrl: string;
  readonly name: string;
  readonly fetch?: typeof fetch;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export class LocalSpeechHttpEngine implements SpeechRecognitionEngine {
  private readonly endpoint: URL;
  private readonly name: string;
  private readonly fetcher: typeof fetch;

  constructor(options: LocalSpeechHttpEngineOptions) {
    this.endpoint = new URL(
      "transcribe",
      options.serverUrl.endsWith("/")
        ? options.serverUrl
        : `${options.serverUrl}/`,
    );
    this.name = options.name;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult> {
    request.signal.throwIfAborted();
    const language = { "nl-NL": "nl", "en-US": "en" }[request.language];
    if (!language) {
      throw new Error(`${this.name} does not support "${request.language}".`);
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": request.mimeType,
        "x-sodalis-language": language,
      },
      body: copyToArrayBuffer(request.audio),
      signal: request.signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null &&
          "error" in payload && typeof payload.error === "string"
        ? payload.error : `${this.name} returned HTTP ${response.status}.`;
      throw new Error(message);
    }
    if (typeof payload !== "object" || payload === null ||
        !("text" in payload) || typeof payload.text !== "string") {
      throw new Error(`${this.name} returned an invalid transcript.`);
    }
    return { text: payload.text.trim() };
  }
}
