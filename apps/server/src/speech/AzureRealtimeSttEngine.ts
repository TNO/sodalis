import type { SpeechRecognitionResult } from "./WhisperCppHttpEngine.js";
import type {
  StreamingRecognitionSession,
  StreamingSpeechRecognitionEngine,
} from "./StreamingRecognition.js";
import { createAzureSpeechRecognizer } from "./azureSpeechRecognizer.js";
import { createFfmpegPcmTranscoder } from "./ffmpegPcmTranscoder.js";

export interface PcmTranscoder {
  write(chunk: Uint8Array): void;
  /** Ends the input and resolves once all converted PCM has been delivered. */
  end(): Promise<void>;
  kill(): void;
}

export type PcmTranscoderFactory = (input: {
  readonly mimeType: string;
  onPcm(pcm: Uint8Array): void;
  onError(error: Error): void;
}) => PcmTranscoder;

export interface RecognizerEvents {
  recognizing(text: string): void;
  recognized(text: string): void;
  failed(error: Error): void;
  stopped(): void;
}

/** Continuous recognizer fed with 16 kHz mono PCM16. */
export interface PcmRecognizer {
  write(pcm: Uint8Array): void;
  endAudio(): void;
  close(): Promise<void>;
}

export type PcmRecognizerFactory = (
  config: { readonly endpoint: URL; readonly key: string; readonly language: string },
  events: RecognizerEvents,
) => PcmRecognizer;

export interface AzureRealtimeSttEngineOptions {
  readonly endpoint: string;
  readonly key: string;
  readonly createRecognizer?: PcmRecognizerFactory;
  readonly createTranscoder?: PcmTranscoderFactory;
}

/** Audio beyond this is never sent to Azure; the transcript so far is kept. */
export const AZURE_STT_MAX_AUDIO_SECONDS = 30;
const PCM_BYTES_PER_SECOND = 16000 * 2;
const FINAL_RESULT_TIMEOUT_MS = 10_000;
const ENDPOINT_ERROR =
  "AZURE_STT_ENDPOINT must be an HTTPS Azure Speech resource endpoint " +
  "(https://<resource>.cognitiveservices.azure.com/) without credentials, query, or fragment.";
const SUPPORTED_LOCALES: Readonly<Record<string, string>> = {
  "nl-nl": "nl-NL",
  "en-us": "en-US",
};

/** Validates a Speech resource endpoint such as https://<resource>.cognitiveservices.azure.com/. */
export function parseAzureSpeechEndpoint(value: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(ENDPOINT_ERROR);
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash ||
      !/\.cognitiveservices\.azure\.com$/
        .test(endpoint.hostname)) {
    throw new Error(ENDPOINT_ERROR);
  }
  return endpoint;
}

export class AzureRealtimeSttEngine implements StreamingSpeechRecognitionEngine {
  readonly provider = "azure";
  readonly cloud = true;
  readonly partialIntervalMs = 250;
  private readonly endpoint: URL;
  private readonly key: string;
  private readonly createRecognizer: PcmRecognizerFactory;
  private readonly createTranscoder: PcmTranscoderFactory;

  constructor(options: AzureRealtimeSttEngineOptions) {
    this.endpoint = parseAzureSpeechEndpoint(options.endpoint);
    if (!options.key.trim()) throw new Error("AZURE_STT_KEY is required.");
    this.key = options.key;
    this.createRecognizer = options.createRecognizer ?? createAzureSpeechRecognizer;
    this.createTranscoder = options.createTranscoder ?? createFfmpegPcmTranscoder;
  }

  startSession(config: {
    readonly language: string;
    readonly mimeType: string;
  }): StreamingRecognitionSession {
    const language = SUPPORTED_LOCALES[config.language.toLowerCase()];
    if (!language) throw new Error(`Azure STT does not support "${config.language}".`);
    const segments: string[] = [];
    let hypothesis = "";
    let failure: Error | undefined;
    let released = false;
    let recognizer: PcmRecognizer | undefined;
    let transcoder: PcmTranscoder | undefined;
    let settle!: { resolve(): void; reject(error: Error): void };
    const done = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    done.catch(() => {});
    const release = () => {
      if (released) return;
      released = true;
      transcoder?.kill();
      void recognizer?.close().catch(() => {});
    };
    const fail = (error: Error) => {
      if (failure) return;
      failure = error;
      settle.reject(error);
      release();
    };
    const redact = (error: Error) =>
      new Error(`Azure STT failed: ${error.message.split(this.key).join("[redacted]")}`);
    const throwIfFailed = () => {
      if (failure) throw failure;
    };
    recognizer = this.createRecognizer(
      { endpoint: this.endpoint, key: this.key, language },
      {
        recognizing(text) {
          hypothesis = text;
        },
        recognized(text) {
          if (text.trim()) segments.push(text.trim());
          hypothesis = "";
        },
        failed(error) {
          fail(redact(error));
        },
        stopped() {
          settle.resolve();
        },
      },
    );
    let pcmBytes = 0;
    let audioEnded = false;
    const endAudio = () => {
      if (audioEnded) return;
      audioEnded = true;
      recognizer?.endAudio();
    };
    const maxPcmBytes = AZURE_STT_MAX_AUDIO_SECONDS * PCM_BYTES_PER_SECOND;
    const activeRecognizer = recognizer;
    transcoder = this.createTranscoder({
      mimeType: config.mimeType,
      onPcm(pcm) {
        if (audioEnded) return;
        const accepted = pcm.subarray(0, maxPcmBytes - pcmBytes);
        pcmBytes += accepted.byteLength;
        if (accepted.byteLength) activeRecognizer.write(accepted);
        if (pcmBytes >= maxPcmBytes) {
          endAudio();
          transcoder?.kill();
        }
      },
      onError(error) {
        fail(redact(error));
      },
    });
    const activeTranscoder = transcoder;
    const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
    return {
      write(chunk) {
        throwIfFailed();
        if (!audioEnded) activeTranscoder.write(chunk);
      },
      partialText() {
        throwIfFailed();
        return join(...segments, hypothesis.trim());
      },
      async finish(): Promise<SpeechRecognitionResult> {
        throwIfFailed();
        if (!audioEnded) {
          await activeTranscoder.end();
          endAudio();
        }
        const timeout = setTimeout(() => fail(new Error(
          `Azure STT did not return a final transcript within ${FINAL_RESULT_TIMEOUT_MS / 1000} seconds.`,
        )), FINAL_RESULT_TIMEOUT_MS);
        try {
          await done;
        } finally {
          clearTimeout(timeout);
        }
        released = true;
        await activeRecognizer.close();
        return { text: join(...segments) };
      },
      cancel() {
        fail(new DOMException("Speech recognition was cancelled.", "AbortError"));
      },
    };
  }
}
