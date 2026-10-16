import type { SpeechRecognitionResult } from "./WhisperCppHttpEngine.js";

export interface StreamingRecognitionSession {
  /** Feeds one encoded audio chunk; throws once the recognizer has failed. */
  write(chunk: Uint8Array): void;
  /** Latest hypothesis for the whole utterance; throws once the recognizer has failed. */
  partialText(): string;
  finish(): Promise<SpeechRecognitionResult>;
  cancel(): void;
}

/** A recognizer that decodes audio while it arrives instead of after `finish`. */
export interface StreamingSpeechRecognitionEngine {
  readonly provider: string;
  readonly cloud: boolean;
  /** How often clients should poll for the latest hypothesis. */
  readonly partialIntervalMs: number;
  startSession(config: {
    readonly language: string;
    readonly mimeType: string;
  }): StreamingRecognitionSession;
}

export function isStreamingEngine(
  engine: object,
): engine is StreamingSpeechRecognitionEngine {
  return "startSession" in engine;
}
