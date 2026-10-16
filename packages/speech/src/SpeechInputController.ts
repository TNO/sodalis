import type { SpeechAudioChunk, SpeechSessionId } from "./index.js";
import type { VoiceActivityDetector } from "./voiceActivity.js";
import { BrowserMicrophoneCapture } from "./BrowserMicrophoneCapture.js";

export type SpeechInputStatus =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "error";

export interface SpeechInputState {
  readonly status: SpeechInputStatus;
  readonly error?: string;
}

export interface SpeechActivityEvent {
  readonly type: "speech-start" | "speech-end";
  readonly sessionId: SpeechSessionId;
  readonly segmentId: string;
  readonly timestampMs: number;
}

export interface SpeechInputAudioCallbacks {
  onSamples(samples: Float32Array, timestampMs: number): void;
  onAudioChunk(chunk: SpeechAudioChunk): void;
  onError(error: Error): void;
}

export interface MicrophoneCapture {
  start(
    callbacks: SpeechInputAudioCallbacks,
    signal: AbortSignal,
  ): Promise<void>;
  stop(): Promise<void>;
  beginSpeechSegment?(): Promise<void>;
  endSpeechSegment?(): Promise<void>;
}

export interface ActiveSpeechOutput {
  stopPlayback(): void;
  cancelTts(): void;
  cancelGeneration(): void;
}

export interface BargeInLatency {
  readonly sessionId: SpeechSessionId;
  readonly detectedAtMs: number;
  readonly visibleAtMs: number;
  readonly latencyMs: number;
}

export interface SpeechInputControllerOptions {
  capture?: MicrophoneCapture;
  detector: VoiceActivityDetector;
  createSessionId?: () => SpeechSessionId;
  now?: () => number;
  /** Segments shorter than this are treated as noise and never reach STT. */
  minSegmentDurationMs?: number;
  requestVisibleFrame?: (callback: (timestampMs: number) => void) => void;
  onStateChange?: (state: Readonly<SpeechInputState>) => void;
  onSpeechStart?: (event: SpeechActivityEvent) => void;
  onSpeechEnd?: (event: SpeechActivityEvent) => void;
  onAudioChunk?: (
    chunk: SpeechAudioChunk,
    sessionId: SpeechSessionId,
  ) => void;
  onAssistantStateChange?: (state: "interrupted" | "listening") => void;
  onBargeInLatency?: (metric: BargeInLatency) => void;
  onError?: (error: Error) => void;
}

export interface SpeechInputController {
  readonly state: Readonly<SpeechInputState>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  setActiveOutput(output: ActiveSpeechOutput | undefined): void;
}

let fallbackSessionId = 0;

function newSessionId(): SpeechSessionId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackSessionId += 1;
  return `speech-input-${Date.now().toString(36)}-${fallbackSessionId}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function defaultRequestVisibleFrame(
  callback: (timestampMs: number) => void,
): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback(performance.now()));
  } else {
    queueMicrotask(() => callback(performance.now()));
  }
}

export function createSpeechInputController(
  options: SpeechInputControllerOptions,
): SpeechInputController {
  const capture = options.capture ?? new BrowserMicrophoneCapture();
  const createId = options.createSessionId ?? newSessionId;
  const now = options.now ?? (() => performance.now());
  const requestVisibleFrame =
    options.requestVisibleFrame ?? defaultRequestVisibleFrame;
  const minSegmentDurationMs = options.minSegmentDurationMs ?? 300;
  let state: SpeechInputState = { status: "idle" };
  let activeAbortController: AbortController | undefined;
  let activeSessionId: SpeechSessionId | undefined;
  let activeOutput: ActiveSpeechOutput | undefined;
  let generation = 0;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  let segmentOperation: Promise<void> = Promise.resolve();
  let segmentSequence = 0;
  let activeSegmentId: string | undefined;
  let activeSegmentStartMs: number | undefined;
  let speechActive = false;
  let stopping = false;
  let disposed = false;

  const setState = (nextState: SpeechInputState) => {
    state = nextState;
    options.onStateChange?.(state);
  };

  const reportError = (error: unknown) => {
    const normalized = asError(error);
    if (options.onError) options.onError(normalized);
    else console.error("Speech input error:", normalized);
  };

  const stopCapture = (): Promise<void> => {
    let pending: Promise<void>;
    pending = Promise.resolve()
      .then(() => capture.stop())
      .finally(() => {
        if (stopPromise === pending) stopPromise = undefined;
      });
    stopPromise = pending;
    return pending;
  };

  const interruptOutput = (event: SpeechActivityEvent) => {
    const output = activeOutput;
    if (!output) return;
    activeOutput = undefined;

    for (const stop of [
      output.stopPlayback,
      output.cancelTts,
      output.cancelGeneration,
    ]) {
      try {
        stop.call(output);
      } catch (error) {
        reportError(error);
      }
    }

    options.onAssistantStateChange?.("interrupted");
    options.onAssistantStateChange?.("listening");
    requestVisibleFrame((visibleAtMs) => {
      options.onBargeInLatency?.({
        sessionId: event.sessionId,
        detectedAtMs: event.timestampMs,
        visibleAtMs,
        latencyMs: Math.max(0, visibleAtMs - event.timestampMs),
      });
    });
  };

  const failCapture = (error: unknown, runGeneration: number) => {
    if (disposed || runGeneration !== generation || !activeAbortController) {
      return;
    }
    const normalized = asError(error);
    activeAbortController.abort(normalized);
    activeAbortController = undefined;
    activeSessionId = undefined;
    generation += 1;
    stopping = true;
    speechActive = false;
    options.detector.reset();
    setState({ status: "error", error: normalized.message });
    void stopCapture().catch((stopError: unknown) => {
      const cleanupError = asError(stopError);
      setState({
        status: "error",
        error: `${normalized.message} Microphone cleanup failed: ${cleanupError.message}`,
      });
      reportError(cleanupError);
    });
  };

  const queueSegmentOperation = (
    operation: () => Promise<void> | void,
    runGeneration: number,
  ): Promise<void> => {
    const pending = segmentOperation.then(operation);
    segmentOperation = pending.catch((error: unknown) => {
      failCapture(error, runGeneration);
    });
    return segmentOperation;
  };

  const processActivity = (
    type: SpeechActivityEvent["type"],
    sessionId: SpeechSessionId,
    timestampMs: number,
    runGeneration: number,
  ) => {
    const segmentId =
      type === "speech-start"
        ? `${sessionId}:segment-${++segmentSequence}`
        : activeSegmentId ?? `${sessionId}:segment-${segmentSequence}`;
    const event: SpeechActivityEvent = {
      type,
      sessionId,
      segmentId,
      timestampMs,
    };
    if (type === "speech-start") {
      speechActive = true;
      activeSegmentId = segmentId;
      activeSegmentStartMs = timestampMs;
      interruptOutput(event);
      options.onSpeechStart?.(event);
      if (capture.beginSpeechSegment) {
        void queueSegmentOperation(
          () => capture.beginSpeechSegment?.(),
          runGeneration,
        );
      }
    } else {
      speechActive = false;
      activeSegmentId = undefined;
      const isTooShort =
        activeSegmentStartMs !== undefined &&
        timestampMs - activeSegmentStartMs < minSegmentDurationMs;
      activeSegmentStartMs = undefined;
      if (capture.endSpeechSegment) {
        void queueSegmentOperation(async () => {
          await capture.endSpeechSegment?.();
          if (
            runGeneration === generation &&
            activeSessionId === sessionId &&
            !isTooShort
          ) {
            options.onSpeechEnd?.(event);
          }
        }, runGeneration);
      } else if (!isTooShort) {
        options.onSpeechEnd?.(event);
      }
    }
  };

  const start = (): Promise<void> => {
    if (disposed) {
      return Promise.reject(
        new Error("Speech input controller has been disposed."),
      );
    }
    if (state.status === "listening") return Promise.resolve();
    if (startPromise) return startPromise;

    let pending: Promise<void>;
    pending = (async () => {
      if (stopPromise) await stopPromise;
      if (disposed) {
        throw new Error("Speech input controller has been disposed.");
      }

      const runGeneration = ++generation;
      const abortController = new AbortController();
      const sessionId = createId();
      activeAbortController = abortController;
      activeSessionId = sessionId;
      segmentOperation = Promise.resolve();
      segmentSequence = 0;
      activeSegmentId = undefined;
      activeSegmentStartMs = undefined;
      speechActive = false;
      stopping = false;
      options.detector.reset();
      setState({ status: "requesting-permission" });

      try {
        await capture.start(
          {
            onSamples(samples, timestampMs) {
              if (
                stopping ||
                runGeneration !== generation ||
                activeSessionId !== sessionId
              ) {
                return;
              }
              for (const event of options.detector.process(
                samples,
                timestampMs,
              )) {
                processActivity(
                  event.type,
                  sessionId,
                  event.timestampMs,
                  runGeneration,
                );
              }
            },
            onAudioChunk(chunk) {
              if (
                runGeneration === generation &&
                activeSessionId === sessionId
              ) {
                options.onAudioChunk?.(chunk, sessionId);
              }
            },
            onError(error) {
              failCapture(error, runGeneration);
            },
          },
          abortController.signal,
        );
        if (
          runGeneration === generation &&
          activeSessionId === sessionId &&
          !abortController.signal.aborted
        ) {
          setState({ status: "listening" });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          failCapture(error, runGeneration);
          throw error;
        }
      }
    })();
    startPromise = pending;
    return pending.finally(() => {
      if (startPromise === pending) startPromise = undefined;
    });
  };

  const stop = async (): Promise<void> => {
    if (!activeAbortController) {
      if (stopPromise) await stopPromise;
      return;
    }
    stopping = true;
    const sessionId = activeSessionId;
    const runGeneration = generation;
    if (speechActive && sessionId) {
      speechActive = false;
      const endTimestampMs = now();
      const event: SpeechActivityEvent = {
        type: "speech-end",
        sessionId,
        segmentId:
          activeSegmentId ?? `${sessionId}:segment-${segmentSequence}`,
        timestampMs: endTimestampMs,
      };
      const isTooShort =
        activeSegmentStartMs !== undefined &&
        endTimestampMs - activeSegmentStartMs < minSegmentDurationMs;
      activeSegmentId = undefined;
      activeSegmentStartMs = undefined;
      if (capture.endSpeechSegment) {
        await queueSegmentOperation(async () => {
          await capture.endSpeechSegment?.();
          if (
            runGeneration === generation &&
            activeSessionId === sessionId &&
            !isTooShort
          ) {
            options.onSpeechEnd?.(event);
          }
        }, runGeneration);
      } else if (!isTooShort) {
        options.onSpeechEnd?.(event);
      }
    }
    await segmentOperation;
    if (!activeAbortController) {
      if (stopPromise) await stopPromise;
      return;
    }
    const abortController = activeAbortController;
    activeAbortController = undefined;
    activeSessionId = undefined;
    generation += 1;
    startPromise = undefined;
    options.detector.reset();
    abortController?.abort();
    try {
      await stopCapture();
      setState({ status: "idle" });
    } catch (error) {
      const normalized = asError(error);
      setState({ status: "error", error: normalized.message });
      throw normalized;
    }
  };

  return {
    get state() {
      return state;
    },
    start,
    stop,
    async dispose() {
      if (disposed) return;
      await stop();
      disposed = true;
    },
    setActiveOutput(output) {
      activeOutput = output;
    },
  };
}
