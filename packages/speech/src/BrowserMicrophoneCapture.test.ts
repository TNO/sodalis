import { describe, expect, it, vi } from "vitest";
import {
  BrowserMicrophoneCapture,
  type SpeechInputAudioCallbacks,
} from "./index.js";

class FakeMediaRecorder extends EventTarget {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([4, 5])], { type: this.mimeType }),
    } as BlobEvent);
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

function createStream() {
  const track = Object.assign(new EventTarget(), {
    stop: vi.fn(),
  }) as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

function createAudioContext() {
  const analyser = {
    fftSize: 16,
    getFloatTimeDomainData(samples: Float32Array) {
      samples.fill(0.2);
    },
  } as unknown as AnalyserNode;
  const context = {
    state: "running",
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createAnalyser: () => analyser,
    createMediaStreamSource: () => ({ connect: vi.fn() }),
  } as unknown as AudioContext;
  return { context, analyser };
}

function createCallbacks(): SpeechInputAudioCallbacks {
  return {
    onSamples: vi.fn(),
    onAudioChunk: vi.fn(),
    onError: vi.fn(),
  };
}

describe("browser microphone capture", () => {
  it("captures audio frames and recorded chunks, then releases browser resources", async () => {
    const { stream, track } = createStream();
    const { context } = createAudioContext();
    const recorder = new FakeMediaRecorder();
    const callbacks = createCallbacks();
    const controller = new AbortController();
    let scheduledFrame: (() => void) | undefined;
    const capture = new BrowserMicrophoneCapture({
      getUserMedia: vi.fn(async () => stream),
      createAudioContext: () => context,
      createMediaRecorder: () => recorder as unknown as MediaRecorder,
      scheduleFrames(callback) {
        scheduledFrame = callback;
        return 1;
      },
      cancelFrames: vi.fn(),
      now: () => 42,
    });

    await capture.start(callbacks, controller.signal);
    scheduledFrame?.();
    const stopRecorder = vi.spyOn(recorder, "stop");
    recorder.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: recorder.mimeType }),
    } as BlobEvent);
    await Promise.all([capture.stop(), capture.stop()]);

    expect(callbacks.onSamples).toHaveBeenCalledOnce();
    const recordedSamples = vi.mocked(callbacks.onSamples).mock.calls[0]?.[0];
    expect(recordedSamples?.length).toBe(1024);
    expect(recordedSamples?.[0]).toBeCloseTo(0.2);
    expect(vi.mocked(callbacks.onSamples).mock.calls[0]?.[1]).toBe(42);
    expect(callbacks.onAudioChunk).toHaveBeenCalledWith({
      data: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
    });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(stopRecorder).toHaveBeenCalledOnce();
  });

  it("propagates microphone permission denial", async () => {
    const denied = new Error("Permission was denied.");
    const capture = new BrowserMicrophoneCapture({
      getUserMedia: vi.fn(async () => {
        throw denied;
      }),
      createAudioContext: () => {
        throw new Error("Not expected.");
      },
      createMediaRecorder: () => {
        throw new Error("Not expected.");
      },
    });

    await expect(
      capture.start(createCallbacks(), new AbortController().signal),
    ).rejects.toBe(denied);
  });

  it("reports microphone loss to the input controller", async () => {
    const { stream, track } = createStream();
    const { context } = createAudioContext();
    const recorder = new FakeMediaRecorder();
    const callbacks = createCallbacks();
    const capture = new BrowserMicrophoneCapture({
      getUserMedia: async () => stream,
      createAudioContext: () => context,
      createMediaRecorder: () => recorder as unknown as MediaRecorder,
      scheduleFrames: () => 1,
      cancelFrames: () => undefined,
    });

    await capture.start(callbacks, new AbortController().signal);
    track.dispatchEvent(new Event("ended"));

    expect(callbacks.onError).toHaveBeenCalledWith(
      new Error("The microphone was disconnected."),
    );
    await capture.stop();
  });
});
