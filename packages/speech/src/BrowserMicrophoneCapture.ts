import type { SpeechAudioChunk } from "./index.js";
import type { MicrophoneCapture, SpeechInputAudioCallbacks } from "./SpeechInputController.js";

const AUDIO_FRAME_INTERVAL_MS = 20;
const RECORDED_CHUNK_INTERVAL_MS = 200;

export interface BrowserMicrophoneCaptureOptions {
  getUserMedia?: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  createAudioContext?: () => AudioContext;
  createMediaRecorder?: (stream: MediaStream) => MediaRecorder;
  scheduleFrames?: (
    callback: () => void,
    intervalMs: number,
  ) => number;
  cancelFrames?: (handle: number) => void;
  now?: () => number;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function stopTracks(stream: MediaStream): void {
  const errors: unknown[] = [];
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Unable to stop microphone tracks.");
}

export class BrowserMicrophoneCapture implements MicrophoneCapture {
  private readonly options: BrowserMicrophoneCaptureOptions;
  private callbacks: SpeechInputAudioCallbacks | undefined;
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private recorder: MediaRecorder | undefined;
  private analyser: AnalyserNode | undefined;
  private frameHandle: number | undefined;
  private abortSignal: AbortSignal | undefined;
  private abortHandler: (() => void) | undefined;
  private readonly trackEndHandlers = new Map<MediaStreamTrack, () => void>();
  private readonly pendingAudio = new Set<Promise<void>>();
  private stopPromise: Promise<void> | undefined;
  private segmentStopPromise: Promise<void> | undefined;

  constructor(options: BrowserMicrophoneCaptureOptions = {}) {
    this.options = options;
  }

  async start(
    callbacks: SpeechInputAudioCallbacks,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.stopPromise) await this.stopPromise;
    if (this.stream) throw new Error("Microphone capture is already active.");
    signal.throwIfAborted();
    if (
      !this.options.createMediaRecorder &&
      typeof globalThis.MediaRecorder === "undefined"
    ) {
      throw new Error("This browser does not support microphone recording.");
    }
    if (
      !this.options.createAudioContext &&
      typeof globalThis.AudioContext === "undefined"
    ) {
      throw new Error("This browser does not support microphone analysis.");
    }

    const mediaDevices =
      typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    const getUserMedia =
      this.options.getUserMedia ??
      (mediaDevices
        ? (constraints: MediaStreamConstraints) =>
            mediaDevices.getUserMedia(constraints)
        : undefined);
    if (!getUserMedia) {
      throw new Error("This browser does not provide microphone access.");
    }

    const stream = await getUserMedia({ audio: true });
    if (signal.aborted) {
      stopTracks(stream);
      return;
    }
    this.callbacks = callbacks;
    this.stream = stream;
    this.abortSignal = signal;
    this.abortHandler = () => {
      void this.stop().catch(callbacks.onError);
    };
    signal.addEventListener("abort", this.abortHandler, { once: true });

    try {
      const createContext =
        this.options.createAudioContext ?? (() => new AudioContext());
      const context = createContext();
      this.context = context;
      await context.resume();
      if (signal.aborted) {
        await this.stop();
        return;
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      this.analyser = analyser;

      for (const track of stream.getAudioTracks()) {
        const onEnded = () =>
          callbacks.onError(new Error("The microphone was disconnected."));
        this.trackEndHandlers.set(track, onEnded);
        track.addEventListener("ended", onEnded, { once: true });
      }

      this.frameHandle = (this.options.scheduleFrames ?? window.setInterval.bind(window))(
        () => {
          try {
            const samples = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(samples);
            callbacks.onSamples(
              samples,
              (this.options.now ?? (() => performance.now()))(),
            );
          } catch (error) {
            callbacks.onError(asError(error));
          }
        },
        AUDIO_FRAME_INTERVAL_MS,
      );
    } catch (error) {
      try {
        await this.stop();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Microphone setup failed and cleanup was incomplete.",
        );
      }
      throw error;
    }
  }

  async beginSpeechSegment(): Promise<void> {
    if (!this.stream || !this.callbacks) {
      throw new Error("Microphone capture must be active before speech.");
    }
    if (this.recorder) return;
    if (this.segmentStopPromise) await this.segmentStopPromise;
    if (!this.stream || !this.callbacks) {
      throw new Error("Microphone capture stopped before speech recording.");
    }

    const stream = this.stream;
    const callbacks = this.callbacks;
    const recorder = this.options.createMediaRecorder
      ? this.options.createMediaRecorder(stream)
      : new MediaRecorder(stream);
    this.recorder = recorder;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data.size) return;
      const pending = event.data
        .arrayBuffer()
        .then((buffer) => {
          const chunk: SpeechAudioChunk = {
            data: new Uint8Array(buffer),
            mimeType:
              recorder.mimeType ||
              event.data.type ||
              "application/octet-stream",
          };
          if (this.callbacks === callbacks) callbacks.onAudioChunk(chunk);
        })
        .catch((error: unknown) => callbacks.onError(asError(error)));
      this.pendingAudio.add(pending);
      void pending.then(
        () => this.pendingAudio.delete(pending),
        () => this.pendingAudio.delete(pending),
      );
    };
    recorder.onerror = () => {
      callbacks.onError(new Error("Microphone recording failed."));
    };
    try {
      recorder.start(RECORDED_CHUNK_INTERVAL_MS);
    } catch (error) {
      this.recorder = undefined;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      throw error;
    }
  }

  endSpeechSegment(): Promise<void> {
    if (this.segmentStopPromise) return this.segmentStopPromise;
    const recorder = this.recorder;
    this.recorder = undefined;
    let pending: Promise<void>;
    pending = (async () => {
      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve, reject) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          try {
            recorder.stop();
          } catch (error) {
            reject(error);
          }
        });
      }
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
      }
      await this.drainAudio();
    })().finally(() => {
      if (this.segmentStopPromise === pending) {
        this.segmentStopPromise = undefined;
      }
    });
    this.segmentStopPromise = pending;
    return pending;
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    let pending: Promise<void>;
    pending = this.release().finally(() => {
      if (this.stopPromise === pending) this.stopPromise = undefined;
    });
    this.stopPromise = pending;
    return pending;
  }

  private async release(): Promise<void> {
    const cleanupErrors: unknown[] = [];
    const signal = this.abortSignal;
    const abortHandler = this.abortHandler;
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
    this.abortSignal = undefined;
    this.abortHandler = undefined;

    if (this.frameHandle !== undefined) {
      try {
        (this.options.cancelFrames ?? window.clearInterval.bind(window))(this.frameHandle);
      } catch (error) {
        cleanupErrors.push(error);
      }
      this.frameHandle = undefined;
    }

    try {
      await this.endSpeechSegment();
    } catch (error) {
      cleanupErrors.push(error);
    }

    for (const [track, handler] of this.trackEndHandlers) {
      track.removeEventListener("ended", handler);
    }
    this.trackEndHandlers.clear();

    const stream = this.stream;
    this.stream = undefined;
    if (stream) {
      try {
        stopTracks(stream);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    this.callbacks = undefined;
    this.analyser = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") {
      try {
        await context.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Microphone cleanup failed.");
    }
  }

  private async drainAudio(): Promise<void> {
    const pendingAudio = [...this.pendingAudio];
    this.pendingAudio.clear();
    const pendingResults = await Promise.allSettled(pendingAudio);
    const errors = pendingResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length) {
      throw new AggregateError(errors, "Recorded microphone audio could not be delivered.");
    }
  }
}
