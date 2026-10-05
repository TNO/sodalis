import { describe, expect, it, vi } from "vitest";
import type {
  MicrophoneCapture,
  SpeechInputAudioCallbacks,
} from "./SpeechInputController.js";
import { createSpeechInputController } from "./SpeechInputController.js";
import { createEnergyVoiceActivityDetector } from "./voiceActivity.js";

function samples(amplitude: number): Float32Array {
  return Float32Array.from({ length: 16 }, () => amplitude);
}

function createCapture(startError?: Error): {
  capture: MicrophoneCapture;
  callbacks: () => SpeechInputAudioCallbacks;
  signal: () => AbortSignal;
} {
  let callbacks: SpeechInputAudioCallbacks | undefined;
  let signal: AbortSignal | undefined;
  const capture: MicrophoneCapture = {
    start: vi.fn(async (nextCallbacks, nextSignal) => {
      callbacks = nextCallbacks;
      signal = nextSignal;
      if (startError) throw startError;
    }),
    stop: vi.fn(async () => undefined),
    beginSpeechSegment: vi.fn(async () => undefined),
    endSpeechSegment: vi.fn(async () => undefined),
  };
  return {
    capture,
    callbacks: () => {
      if (!callbacks) throw new Error("Microphone capture has not started.");
      return callbacks;
    },
    signal: () => {
      if (!signal) throw new Error("Microphone capture has not started.");
      return signal;
    },
  };
}

function makeController(
  capture: MicrophoneCapture,
  options: Partial<Parameters<typeof createSpeechInputController>[0]> = {},
) {
  return createSpeechInputController({
    capture,
    detector: createEnergyVoiceActivityDetector({
      thresholdRms: 0.1,
      startFrames: 2,
      endFrames: 2,
    }),
    createSessionId: () => "speech-session-1",
    ...options,
  });
}

describe("speech input controller", () => {
  it("does not start recognition during sustained silence with the microphone open", async () => {
    const { capture, callbacks } = createCapture();
    const onSpeechStart = vi.fn();
    const controller = makeController(capture, {
      detector: createEnergyVoiceActivityDetector(),
      onSpeechStart,
    });
    await controller.start();
    for (let index = 0; index < 150; index += 1) {
      callbacks().onSamples(samples(0), index * 20);
    }
    expect(onSpeechStart).not.toHaveBeenCalled();
    expect(capture.beginSpeechSegment).not.toHaveBeenCalled();
    await controller.dispose();
  });

  it("surfaces permission denial in state and rethrows the failure", async () => {
    const denied = new Error("Microphone permission was denied.");
    const { capture } = createCapture(denied);
    const controller = makeController(capture);

    await expect(controller.start()).rejects.toBe(denied);
    expect(controller.state).toEqual({
      status: "error",
      error: denied.message,
    });
    await controller.dispose();
  });

  it("tags speech events and audio with the active session ID", async () => {
    const { capture, callbacks } = createCapture();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const onAudioChunk = vi.fn();
    const controller = makeController(capture, {
      onSpeechStart,
      onSpeechEnd,
      onAudioChunk,
    });
    await controller.start();

    callbacks().onSamples(samples(0.2), 20);
    callbacks().onSamples(samples(0.2), 40);
    callbacks().onAudioChunk({
      data: new Uint8Array([1, 2]),
      mimeType: "audio/webm",
    });
    callbacks().onSamples(samples(0.01), 60);
    callbacks().onSamples(samples(0.01), 80);

    expect(onSpeechStart).toHaveBeenCalledWith({
      type: "speech-start",
      sessionId: "speech-session-1",
      segmentId: "speech-session-1:segment-1",
      timestampMs: 40,
    });
    await vi.waitFor(() =>
      expect(onSpeechEnd).toHaveBeenCalledWith({
        type: "speech-end",
        sessionId: "speech-session-1",
        segmentId: "speech-session-1:segment-1",
        timestampMs: 80,
      }),
    );
    expect(capture.beginSpeechSegment).toHaveBeenCalledOnce();
    expect(capture.endSpeechSegment).toHaveBeenCalledOnce();
    expect(onAudioChunk).toHaveBeenCalledWith(
      { data: new Uint8Array([1, 2]), mimeType: "audio/webm" },
      "speech-session-1",
    );
    await controller.dispose();
  });

  it("stops playback before cancelling output and opening a new input turn", async () => {
    const { capture, callbacks } = createCapture();
    const order: string[] = [];
    let visibleFrame: ((timestampMs: number) => void) | undefined;
    const onSpeechStart = vi.fn(() => order.push("new-turn"));
    const onBargeInLatency = vi.fn();
    const controller = makeController(capture, {
      onSpeechStart,
      onAssistantStateChange: (state) => order.push(`avatar-${state}`),
      onBargeInLatency,
      requestVisibleFrame: (callback) => {
        visibleFrame = callback;
      },
    });
    await controller.start();
    controller.setActiveOutput({
      stopPlayback: () => order.push("stop-playback"),
      cancelTts: () => order.push("cancel-tts"),
      cancelGeneration: () => order.push("cancel-generation"),
    });

    callbacks().onSamples(samples(0.2), 100);
    callbacks().onSamples(samples(0.2), 116);

    expect(order).toEqual([
      "stop-playback",
      "cancel-tts",
      "cancel-generation",
      "avatar-interrupted",
      "avatar-listening",
      "new-turn",
    ]);
    visibleFrame?.(132);
    expect(onBargeInLatency).toHaveBeenCalledWith({
      sessionId: "speech-session-1",
      detectedAtMs: 116,
      visibleAtMs: 132,
      latencyMs: 16,
    });
    await controller.dispose();
  });

  it("aborts capture on stop and ignores late audio callbacks", async () => {
    const { capture, callbacks, signal } = createCapture();
    const onAudioChunk = vi.fn();
    const controller = makeController(capture, { onAudioChunk });
    await controller.start();
    const staleCallbacks = callbacks();

    await controller.stop();
    staleCallbacks.onAudioChunk({
      data: new Uint8Array([3]),
      mimeType: "audio/webm",
    });

    expect(signal().aborted).toBe(true);
    expect(controller.state).toEqual({ status: "idle" });
    expect(onAudioChunk).not.toHaveBeenCalled();
    await controller.dispose();
  });

  it("allows a new push-to-talk press while an old permission request is pending", async () => {
    let resolveFirstStart: (() => void) | undefined;
    const capture: MicrophoneCapture = {
      start: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveFirstStart = resolve;
            }),
        )
        .mockImplementationOnce(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const controller = makeController(capture);
    const firstStart = controller.start();
    await controller.stop();

    await controller.start();
    expect(capture.start).toHaveBeenCalledTimes(2);

    resolveFirstStart?.();
    await firstStart;
    expect(controller.state).toEqual({ status: "listening" });
    await controller.dispose();
  });

  it("finishes an active speech segment when push-to-talk is released", async () => {
    const { capture, callbacks } = createCapture();
    const onSpeechEnd = vi.fn();
    const controller = makeController(capture, {
      onSpeechEnd,
      now: () => 90,
    });
    await controller.start();
    callbacks().onSamples(samples(0.2), 20);
    callbacks().onSamples(samples(0.2), 40);

    await controller.stop();

    expect(capture.endSpeechSegment).toHaveBeenCalledOnce();
    expect(onSpeechEnd).toHaveBeenCalledWith({
      type: "speech-end",
      sessionId: "speech-session-1",
      segmentId: "speech-session-1:segment-1",
      timestampMs: 90,
    });
    expect(controller.state).toEqual({ status: "idle" });
    await controller.dispose();
  });

  it("assigns distinct IDs to utterances within one microphone session", async () => {
    const { capture, callbacks } = createCapture();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const controller = makeController(capture, { onSpeechStart, onSpeechEnd });
    await controller.start();
    const emitUtterance = async (offset: number) => {
      callbacks().onSamples(samples(0.2), offset);
      callbacks().onSamples(samples(0.2), offset + 20);
      callbacks().onSamples(samples(0.01), offset + 40);
      callbacks().onSamples(samples(0.01), offset + 60);
      await vi.waitFor(() =>
        expect(onSpeechEnd).toHaveBeenCalledTimes(
          offset === 0 ? 1 : 2,
        ),
      );
    };

    await emitUtterance(0);
    await emitUtterance(100);

    const firstStart = onSpeechStart.mock.calls[0]?.[0];
    const secondStart = onSpeechStart.mock.calls[1]?.[0];
    const firstEnd = onSpeechEnd.mock.calls[0]?.[0];
    const secondEnd = onSpeechEnd.mock.calls[1]?.[0];
    expect(firstStart?.segmentId).toBe("speech-session-1:segment-1");
    expect(secondStart?.segmentId).toBe("speech-session-1:segment-2");
    expect(firstEnd?.segmentId).toBe(firstStart?.segmentId);
    expect(secondEnd?.segmentId).toBe(secondStart?.segmentId);
    await controller.dispose();
  });

  it("surfaces microphone loss and stops the capture", async () => {
    const { capture, callbacks } = createCapture();
    const controller = makeController(capture);
    await controller.start();

    callbacks().onError(new Error("Microphone disconnected."));

    expect(controller.state).toEqual({
      status: "error",
      error: "Microphone disconnected.",
    });
    await vi.waitFor(() => expect(capture.stop).toHaveBeenCalled());
    await controller.dispose();
  });
});
