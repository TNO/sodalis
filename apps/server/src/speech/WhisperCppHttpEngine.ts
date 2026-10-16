export interface SpeechRecognitionRequest {
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly language: string;
  readonly signal: AbortSignal;
}

export interface SpeechRecognitionResult {
  readonly text: string;
}

export interface SpeechRecognitionEngine {
  transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult>;
}

export interface WhisperCppHttpEngineOptions {
  readonly serverUrl: string;
  readonly fetch?: typeof fetch;
  /** Forwarded as whisper.cpp's `no_speech_thold` form field (its default is 0.6). */
  readonly noSpeechThreshold?: number;
}

const WHISPER_LANGUAGE_TAGS: Readonly<Record<string, string>> = {
  "nl-nl": "nl",
  "en-us": "en",
};
const AUDIO_FILENAMES: Readonly<Record<string, string>> = {
  "audio/webm": "speech.webm",
  "audio/ogg": "speech.ogg",
  "audio/wav": "speech.wav",
  "audio/mp4": "speech.m4a",
  "audio/mpeg": "speech.mp3",
  "application/octet-stream": "speech.webm",
};

function errorMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return "Whisper.cpp returned an invalid response.";
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export class WhisperCppHttpEngine implements SpeechRecognitionEngine {
  private readonly endpoint: URL;
  private readonly fetcher: typeof fetch;
  private readonly noSpeechThreshold: number;

  constructor(options: WhisperCppHttpEngineOptions) {
    this.endpoint = new URL(
      "inference",
      options.serverUrl.endsWith("/")
        ? options.serverUrl
        : `${options.serverUrl}/`,
    );
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.noSpeechThreshold = options.noSpeechThreshold ?? 0.6;
  }

  async transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult> {
    request.signal.throwIfAborted();
    const language = WHISPER_LANGUAGE_TAGS[request.language.toLowerCase()];
    if (!language) {
      throw new Error(`Whisper.cpp does not support "${request.language}".`);
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([copyToArrayBuffer(request.audio)], { type: request.mimeType }),
      AUDIO_FILENAMES[request.mimeType] ?? "speech.webm",
    );
    form.append("language", language);
    form.append("response_format", "json");
    // Suppresses low-confidence output on silence/noise, mitigating hallucinations.
    form.append("no_speech_thold", String(this.noSpeechThreshold));

    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      body: form,
      signal: request.signal,
    });
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        throw new Error(
          `Whisper.cpp returned HTTP ${response.status}: ${raw.slice(0, 500)}`,
        );
      }
      throw new Error("Whisper.cpp returned an invalid JSON response.");
    }
    if (!response.ok) {
      throw new Error(
        `Whisper.cpp returned HTTP ${response.status}: ${errorMessage(payload)}`,
      );
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("text" in payload) ||
      typeof payload.text !== "string"
    ) {
      throw new Error("Whisper.cpp response did not contain a transcript.");
    }
    return { text: payload.text.trim() };
  }
}
