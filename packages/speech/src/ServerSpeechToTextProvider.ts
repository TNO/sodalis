import type {
  SpeechAudioChunk,
  SpeechSessionId,
  SpeechToTextCapabilities,
  SpeechToTextEvent,
  SpeechToTextProvider,
  SpeechToTextSession,
  SpeechToTextSessionConfig,
} from "./index.js";

const SERVER_STT_CAPABILITIES: SpeechToTextCapabilities = {
  runtime: "server",
  languages: ["nl-NL", "en-US"],
  partialResults: false,
  inputAudioMimeTypes: [
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/mp4",
    "audio/mpeg",
    "application/octet-stream",
  ],
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface EventQueue<T> {
  readonly iterable: AsyncIterable<T>;
  push(value: T): void;
  close(error?: unknown): void;
}

function createEventQueue<T>(): EventQueue<T> {
  const values: T[] = [];
  const waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let closed = false;
  let failure: unknown;

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            if (values.length) {
              return Promise.resolve({
                value: values.shift() as T,
                done: false,
              });
            }
            if (failure !== undefined) return Promise.reject(failure);
            if (closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve, reject) => {
              waiters.push({ resolve, reject });
            });
          },
          return(): Promise<IteratorResult<T>> {
            closed = true;
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    },
    push(value) {
      if (closed || failure !== undefined) return;
      const waiter = waiters.shift();
      if (waiter) waiter.resolve({ value, done: false });
      else values.push(value);
    },
    close(error) {
      if (closed || failure !== undefined) return;
      if (error !== undefined) {
        failure = error;
        for (const waiter of waiters.splice(0)) waiter.reject(error);
        return;
      }
      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter.resolve({ value: undefined, done: true });
      }
    },
  };
}

function errorFromResponse(response: Response, details: unknown): Error {
  const message =
    typeof details === "object" &&
    details !== null &&
    "error" in details &&
    typeof details.error === "string"
      ? details.error
      : `Speech server returned HTTP ${response.status}.`;
  return new Error(message);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Error("Speech server returned an invalid JSON response.", {
      cause: error,
    });
  }
}

function readTranscript(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("text" in value) ||
    typeof value.text !== "string"
  ) {
    throw new Error("Speech server returned an invalid transcript.");
  }
  return value.text.trim();
}

function verifySessionResponse(
  value: unknown,
  expectedSessionId: SpeechSessionId,
): void {
  if (
    typeof value !== "object" ||
    value === null ||
    !("sessionId" in value) ||
    value.sessionId !== expectedSessionId
  ) {
    throw new Error("Speech server returned a mismatched session ID.");
  }
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export interface ServerSpeechToTextProviderOptions {
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly onLatency?: (metric: SpeechToTextLatency) => void;
}

export interface SpeechToTextLatency {
  readonly sessionId: SpeechSessionId;
  readonly type: "first-partial" | "final";
  readonly latencyMs: number;
}

export class ServerSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = "server-whisper-cpp";
  readonly capabilities = SERVER_STT_CAPABILITIES;

  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => number;
  private readonly onLatency: ServerSpeechToTextProviderOptions["onLatency"];

  constructor(options: ServerSpeechToTextProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/+$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => performance.now());
    this.onLatency = options.onLatency;
  }

  async createSession(
    config: SpeechToTextSessionConfig,
  ): Promise<SpeechToTextSession> {
    config.signal.throwIfAborted();
    const path = `${this.baseUrl}/speech/stt/sessions`;
    const fetcher = this.fetcher;
    const now = this.now;
    const onLatency = this.onLatency;
    const sessionEndpoint = `${path}/${encodeURIComponent(config.sessionId)}`;
    const cancelRemote = async () => {
      try {
        const response = await fetcher(sessionEndpoint, { method: "DELETE" });
        if (!response.ok) {
          const details = await readJson(response);
          throw errorFromResponse(response, details);
        }
      } catch (error) {
        console.error(
          `Unable to cancel speech session "${config.sessionId}":`,
          error,
        );
      }
    };
    let response: Response;
    try {
      response = await fetcher(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: config.sessionId,
          language: config.language,
        }),
        signal: config.signal,
      });
    } catch (error) {
      await cancelRemote();
      throw error;
    }
    let details: unknown;
    try {
      details = await readJson(response);
      if (response.ok) verifySessionResponse(details, config.sessionId);
    } catch (error) {
      if (response.ok || config.signal.aborted) await cancelRemote();
      throw error;
    }
    if (!response.ok) throw errorFromResponse(response, details);
    if (config.signal.aborted) {
      await cancelRemote();
      config.signal.throwIfAborted();
    }

    const queue = createEventQueue<SpeechToTextEvent>();
    let finished = false;
    let cancelled = false;
    const cancelOnAbort = () => {
      if (cancelled) return;
      cancelled = true;
      queue.close(
        config.signal.reason ??
          new DOMException("Speech session was cancelled.", "AbortError"),
      );
      void cancelRemote();
    };
    config.signal.addEventListener("abort", cancelOnAbort, { once: true });
    if (config.signal.aborted) {
      cancelOnAbort();
      config.signal.throwIfAborted();
    }

    const ensureNotAborted = () => {
      config.signal.throwIfAborted();
    };
    const ensureActive = () => {
      ensureNotAborted();
      if (finished) throw new Error("Speech input has already finished.");
    };

    return {
      id: config.sessionId,
      events: queue.iterable,
      async writeAudio(chunk: SpeechAudioChunk) {
        ensureActive();
        if (!chunk.data.byteLength) return;
        const audioResponse = await fetcher(
          `${path}/${encodeURIComponent(config.sessionId)}/audio`,
          {
            method: "POST",
            headers: { "content-type": chunk.mimeType },
            body: new Blob([copyToArrayBuffer(chunk.data)], {
              type: chunk.mimeType,
            }),
            signal: config.signal,
          },
        );
        const details = await readJson(audioResponse);
        if (!audioResponse.ok) throw errorFromResponse(audioResponse, details);
        ensureActive();
      },
      async finish(speechEndTimestampMs) {
        ensureActive();
        finished = true;
        const speechEndedAtMs = speechEndTimestampMs ?? now();
        try {
          const finishResponse = await fetcher(
            `${path}/${encodeURIComponent(config.sessionId)}/finish`,
            { method: "POST", signal: config.signal },
          );
          const details = await readJson(finishResponse);
          if (!finishResponse.ok) {
            throw errorFromResponse(finishResponse, details);
          }
          ensureNotAborted();
          const event: SpeechToTextEvent = {
            type: "final",
            text: readTranscript(details),
            sessionId: config.sessionId,
          };
          if (!config.signal.aborted && !cancelled) {
            queue.push(event);
            onLatency?.({
              sessionId: config.sessionId,
              type: "final",
              latencyMs: Math.max(0, now() - speechEndedAtMs),
            });
          }
          queue.close();
        } catch (error) {
          queue.close(error);
          throw error;
        } finally {
          config.signal.removeEventListener("abort", cancelOnAbort);
        }
      },
    };
  }
}
