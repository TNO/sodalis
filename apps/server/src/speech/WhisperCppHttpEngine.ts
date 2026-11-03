import { alignSpeechWords, type SpeechWordTimestamp } from "./speechWordAlignment.js";

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

export interface SpeechWordAlignmentResult {
  readonly text: string;
  readonly wordTimestamps: readonly SpeechWordTimestamp[];
}

export interface WordTimestampSpeechRecognitionEngine
  extends SpeechRecognitionEngine {
  transcribeWithWordTimestamps(
    request: SpeechRecognitionRequest,
    sourceText: string,
  ): Promise<SpeechWordAlignmentResult>;
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

export class WhisperCppHttpEngine
  implements WordTimestampSpeechRecognitionEngine {
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
    const payload = await this.requestTranscription(request, "json");
    return { text: readTranscript(payload) };
  }

  async transcribeWithWordTimestamps(
    request: SpeechRecognitionRequest,
    sourceText: string,
  ): Promise<SpeechWordAlignmentResult> {
    if (!sourceText.trim()) throw new Error("Source text must not be empty.");
    const payload = await this.requestTranscription(request, "verbose_json");
    const text = readTranscript(payload);
    const recognizedWords = readWordTimestamps(payload);
    if (!recognizedWords.length) {
      throw new Error("Whisper.cpp returned no word timestamps.");
    }
    const duration =
      typeof payload === "object" &&
      payload !== null &&
      "duration" in payload &&
      typeof payload.duration === "number"
        ? payload.duration
        : undefined;
    return {
      text,
      wordTimestamps: alignSpeechWords(
        sourceText,
        recognizedWords,
        duration,
      ),
    };
  }

  private async requestTranscription(
    request: SpeechRecognitionRequest,
    responseFormat: "json" | "verbose_json",
  ): Promise<unknown> {
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
    form.append("response_format", responseFormat);
    if (responseFormat === "verbose_json") {
      form.append("token_timestamps", "true");
    }
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
    return payload;
  }
}

function readTranscript(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("text" in payload) ||
    typeof payload.text !== "string"
  ) {
    throw new Error("Whisper.cpp response did not contain a transcript.");
  }
  return payload.text.trim();
}

function readWordTimestamps(payload: unknown): SpeechWordTimestamp[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("segments" in payload) ||
    !Array.isArray(payload.segments)
  ) {
    throw new Error("Whisper.cpp response did not contain word timestamps.");
  }
  const timestamps: SpeechWordTimestamp[] = [];
  for (const segment of payload.segments) {
    if (
      typeof segment !== "object" ||
      segment === null ||
      !("words" in segment) ||
      !Array.isArray(segment.words)
    ) {
      continue;
    }
    for (const word of segment.words) {
      if (
        typeof word !== "object" ||
        word === null ||
        !("word" in word) ||
        typeof word.word !== "string" ||
        !("start" in word) ||
        typeof word.start !== "number" ||
        !("end" in word) ||
        typeof word.end !== "number"
      ) {
        throw new Error("Whisper.cpp returned an invalid word timestamp.");
      }
      timestamps.push({
        word: word.word,
        start: word.start,
        end: word.end,
      });
    }
  }
  return timestamps;
}
