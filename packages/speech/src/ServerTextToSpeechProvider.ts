import type {
  SpeechId,
  SpeechOutputChunk,
  SpeechRequest,
  SpeechSessionId,
  TextToSpeechCapabilities,
  TextToSpeechProvider,
} from "./index.js";

const SERVER_TTS_CAPABILITIES: TextToSpeechCapabilities = {
  runtime: "server",
  languages: ["nl-NL", "nl-BE"],
  streamingAudio: true,
  phonemeTiming: false,
  visemeTiming: false,
  wordTiming: false,
  emotionStyleControl: false,
};

const PCM_PARAMETERS = {
  rate: "22050",
  bits: "16",
  channels: "1",
  endianness: "little",
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ServerTextToSpeechLatency {
  readonly sessionId: SpeechSessionId;
  readonly speechId: SpeechId;
  readonly type: "first-audio";
  readonly latencyMs: number;
}

export interface ServerTextToSpeechProviderOptions {
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly onLatency?: (metric: ServerTextToSpeechLatency) => void;
}

function responseError(response: Response): Promise<Error> {
  return response
    .json()
    .then((payload: unknown) => {
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        return new Error(payload.error);
      }
      return new Error(`Speech server returned HTTP ${response.status}.`);
    })
    .catch((error: unknown) => {
      if (error instanceof Error) return error;
      return new Error(`Speech server returned HTTP ${response.status}.`);
    });
}

function validateAudioContentType(value: string): void {
  const [mediaType, ...rawParameters] = value
    .toLowerCase()
    .split(";")
    .map((part) => part.trim());
  if (mediaType !== "audio/pcm") {
    throw new Error("Speech server returned an unsupported audio format.");
  }

  const parameters = new Map(
    rawParameters.map((parameter) => {
      const separator = parameter.indexOf("=");
      return separator < 0
        ? [parameter, ""]
        : [
            parameter.slice(0, separator).trim(),
            parameter.slice(separator + 1).trim(),
          ];
    }),
  );
  for (const [name, expected] of Object.entries(PCM_PARAMETERS)) {
    if (parameters.get(name) !== expected) {
      throw new Error(
        `Speech server returned an unsupported PCM ${name} parameter.`,
      );
    }
  }
}

function verifySpeechHeaders(
  response: Response,
  request: SpeechRequest,
): string {
  if (response.headers.get("x-sodalis-session-id") !== request.sessionId) {
    throw new Error("Speech server returned a mismatched session ID.");
  }
  if (response.headers.get("x-sodalis-speech-id") !== request.speechId) {
    throw new Error("Speech server returned a mismatched speech ID.");
  }

  const mimeType = response.headers.get("content-type") ?? "";
  validateAudioContentType(mimeType);
  return mimeType;
}

export class ServerTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "server-piper";
  readonly capabilities = SERVER_TTS_CAPABILITIES;

  private readonly endpoint: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => number;
  private readonly onLatency: ServerTextToSpeechProviderOptions["onLatency"];

  constructor(options: ServerTextToSpeechProviderOptions = {}) {
    this.endpoint = `${(options.baseUrl ?? "/api").replace(/\/+$/, "")}/speech/tts`;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => performance.now());
    this.onLatency = options.onLatency;
  }

  async *speak(
    request: SpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<SpeechOutputChunk> {
    signal.throwIfAborted();
    const startedAt = this.now();
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw await responseError(response);

    const mimeType = verifySpeechHeaders(response, request);
    if (!response.body) {
      throw new Error("Speech server returned no audio stream.");
    }

    const reader = response.body.getReader();
    let readerCancellation: Promise<void> | undefined;
    let complete = false;
    let sequence = 0;
    let firstAudio = true;
    let trailingByte: number | undefined;
    const cancelReader = () => {
      readerCancellation ??= reader.cancel(signal.reason);
    };
    signal.addEventListener("abort", cancelReader, { once: true });
    if (signal.aborted) cancelReader();

    try {
      while (true) {
        signal.throwIfAborted();
        const result = await reader.read();
        signal.throwIfAborted();
        if (result.done) {
          complete = true;
          break;
        }

        let data = result.value;
        if (trailingByte !== undefined) {
          const combined = new Uint8Array(data.byteLength + 1);
          combined[0] = trailingByte;
          combined.set(data, 1);
          data = combined;
          trailingByte = undefined;
        }
        if (data.byteLength % 2 === 1) {
          trailingByte = data[data.byteLength - 1];
          data = data.subarray(0, data.byteLength - 1);
        }
        if (!data.byteLength) continue;

        if (firstAudio) {
          firstAudio = false;
          this.onLatency?.({
            sessionId: request.sessionId,
            speechId: request.speechId,
            type: "first-audio",
            latencyMs: Math.max(0, this.now() - startedAt),
          });
        }
        yield {
          type: "audio",
          data,
          mimeType,
          sessionId: request.sessionId,
          speechId: request.speechId,
          sequence: sequence++,
        };
      }

      if (trailingByte !== undefined) {
        throw new Error("Speech server ended with an incomplete PCM sample.");
      }
    } finally {
      signal.removeEventListener("abort", cancelReader);
      if (!complete && !readerCancellation) {
        readerCancellation = reader.cancel();
      }
      if (readerCancellation) await readerCancellation;
      reader.releaseLock();
    }
  }
}
