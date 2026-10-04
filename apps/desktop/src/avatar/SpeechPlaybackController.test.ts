import { describe, expect, it, vi } from "vitest";
import type {
  SpeechOutputChunk,
  SpeechRequest,
  TextToSpeechCapabilities,
  TextToSpeechProvider,
} from "@sodalis/speech";
import {
  createSpeechPlaybackController,
  type SpeechAudioContext,
} from "./SpeechPlaybackController.js";

const PCM_MIME_TYPE =
  "audio/pcm;rate=22050;bits=16;channels=1;endianness=little";
const request: SpeechRequest = {
  sessionId: "turn-1",
  speechId: "reply-1",
  text: "Goedemorgen.",
  language: "nl-NL",
};
const capabilities: TextToSpeechCapabilities = {
  runtime: "server",
  languages: ["nl-NL"],
  streamingAudio: true,
  phonemeTiming: false,
  visemeTiming: false,
  wordTiming: false,
  emotionStyleControl: false,
};

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: AudioBufferSourceNode["onended"] = null;
  readonly connect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn(() => this.finish());

  finish() {
    this.onended?.call(
      this as unknown as AudioScheduledSourceNode,
      new Event("ended"),
    );
  }
}

class FakeAudioContext {
  currentTime = 1;
  state = "running";
  readonly destination = {} as AudioNode;
  readonly sources: FakeSource[] = [];
  readonly analyser = {
    fftSize: 256,
    connect: vi.fn(),
    getByteTimeDomainData: vi.fn((samples: Uint8Array) => samples.fill(128)),
  };
  readonly resume = vi.fn(async () => undefined);
  readonly close = vi.fn(async () => {
    this.state = "closed";
  });

  createAnalyser() {
    return this.analyser;
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    const samples = new Float32Array(length);
    return {
      duration: length / sampleRate,
      getChannelData: () => samples,
    };
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

function createProvider(
  synthesize: TextToSpeechProvider["speak"],
): TextToSpeechProvider {
  return {
    id: "test-tts",
    capabilities,
    speak: synthesize,
  };
}

function audioChunk(
  overrides: {
    sessionId?: string;
    speechId?: string;
    sequence?: number;
  } = {},
): SpeechOutputChunk {
  return {
    type: "audio",
    data: new Uint8Array([0, 0, 0, 0]),
    mimeType: PCM_MIME_TYPE,
    sessionId: request.sessionId,
    speechId: request.speechId,
    sequence: 0,
    ...overrides,
  };
}

describe("SpeechPlaybackController", () => {
  it("starts avatar speaking at first playback and returns to neutral when audio ends", async () => {
    const context = new FakeAudioContext();
    const avatar = { setState: vi.fn(), setViseme: vi.fn() };
    const onLatency = vi.fn();
    const onStateChange = vi.fn();
    const onOutputChange = vi.fn();
    const provider = createProvider(async function* (speechRequest, signal) {
      signal.throwIfAborted();
      yield audioChunk({
        sessionId: speechRequest.sessionId,
        speechId: speechRequest.speechId,
      });
    });
    const player = createSpeechPlaybackController({
      provider,
      getAvatarController: () => avatar,
      isListening: () => false,
      onLatency,
      onStateChange,
      onOutputChange,
      createAudioContext: () => context as unknown as SpeechAudioContext,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });

    const speaking = player.speak(request);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(avatar.setState).toHaveBeenCalledWith("speaking");
    expect(onStateChange).toHaveBeenCalledWith(true);
    expect(onOutputChange).toHaveBeenCalledWith(true);

    context.sources[0]?.finish();
    await speaking;

    expect(avatar.setState).toHaveBeenLastCalledWith("idle");
    expect(avatar.setViseme).toHaveBeenLastCalledWith("viseme_sil", 1);
    expect(onStateChange).toHaveBeenLastCalledWith(false);
    expect(onOutputChange).toHaveBeenLastCalledWith(false);
    expect(context.close).toHaveBeenCalledOnce();
    expect(onLatency).toHaveBeenCalledWith(
      expect.objectContaining({ type: "first-audio-to-playback" }),
    );
  });

  it("stops scheduled audio and aborts synthesis on interruption", async () => {
    const context = new FakeAudioContext();
    let observedSignal: AbortSignal | undefined;
    let markSynthStarted: (() => void) | undefined;
    const synthStarted = new Promise<void>((resolve) => {
      markSynthStarted = resolve;
    });
    const provider = createProvider(async function* (speechRequest, signal) {
      observedSignal = signal;
      markSynthStarted?.();
      yield audioChunk({
        sessionId: speechRequest.sessionId,
        speechId: speechRequest.speechId,
      });
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    const onLatency = vi.fn();
    const player = createSpeechPlaybackController({
      provider,
      getAvatarController: () => ({ setState: vi.fn(), setViseme: vi.fn() }),
      isListening: () => false,
      onLatency,
      createAudioContext: () => context as unknown as SpeechAudioContext,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });

    const speaking = player.speak(request);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    await synthStarted;
    player.stopPlayback();
    player.cancelTts();
    await speaking;

    expect(context.sources[0]?.stop).toHaveBeenCalledOnce();
    expect(observedSignal?.aborted).toBe(true);
    expect(context.close).toHaveBeenCalledOnce();
    expect(onLatency).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cancellation-to-silence" }),
    );
  });

  it("rejects stale audio events before scheduling them", async () => {
    const context = new FakeAudioContext();
    const provider = createProvider(async function* () {
      yield audioChunk({ sessionId: "old-turn" });
    });
    const player = createSpeechPlaybackController({
      provider,
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => context as unknown as SpeechAudioContext,
    });

    await expect(player.speak(request)).rejects.toThrow(
      "Speech playback received a stale or out-of-order chunk.",
    );
    expect(context.sources).toHaveLength(0);
    expect(context.close).toHaveBeenCalledOnce();
  });
});
