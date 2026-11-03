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
  readonly playbackRate = { value: 1 };
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
  it.each([undefined, 0.8])("paces sentences and captions without double-applying native rate %s", async (appliedRate) => {
    const context = new FakeAudioContext();
    let tick: FrameRequestCallback | undefined;
    const onWordChange = vi.fn();
    let count = 0;
    const provider = createProvider(async function* (speech) {
      if (count++ === 0) context.currentTime = 5;
      yield {
        ...audioChunk({ sessionId: speech.sessionId, speechId: speech.speechId }),
        data: new Uint8Array(44_100),
        ...(appliedRate !== undefined ? { appliedRate } : {}),
      };
      yield {
        type: "timing" as const, kind: "word" as const, value: count === 1 ? "Eerst" : "Dan",
        startMs: 100, endMs: 500,
        sessionId: speech.sessionId, speechId: speech.speechId, sequence: 1,
      };
    });
    const player = createSpeechPlaybackController({
      provider,
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => context as unknown as SpeechAudioContext,
      requestFrame: (callback) => { tick = callback; return 1; },
      cancelFrame: vi.fn(),
      onWordChange,
      getSpeechPreferences: () => ({ rate: 0.8, sentencePauseMs: 400 }),
    });
    const speaking = player.speak({ ...request, text: "Eerst rustig. Dan verder." });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    const expectedRate = appliedRate === undefined ? 0.8 : 1;
    expect(context.sources[0]?.playbackRate.value).toBe(expectedRate);
    expect(context.sources[1]?.start).toHaveBeenCalledWith(5 + 1 / expectedRate + 0.4);
    context.currentTime = 5.2;
    tick?.(0);
    expect(onWordChange).toHaveBeenLastCalledWith(0, expect.anything());
    context.currentTime = 5 + 1 / expectedRate + 0.6;
    tick?.(0);
    expect(onWordChange).toHaveBeenLastCalledWith(2, expect.anything());
    for (const source of context.sources) source.finish();
    await speaking;
  });

  it("rejects invalid pacing before creating audio or calling providers", async () => {
    const createAudioContext = vi.fn();
    const speak = vi.fn(async function* () { yield audioChunk(); });
    const player = createSpeechPlaybackController({
      provider: createProvider(speak),
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext,
    });
    await expect(player.speak({ ...request, rate: 0 })).rejects.toThrow("pacing");
    await expect(player.speak({ ...request, sentencePauseMs: 1001 })).rejects.toThrow("pacing");
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

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
    expect(onStateChange).toHaveBeenCalledWith(true, request);
    expect(onOutputChange).toHaveBeenCalledWith(true);

    context.sources[0]?.finish();
    await speaking;

    expect(avatar.setState).toHaveBeenLastCalledWith("idle");
    expect(avatar.setViseme).toHaveBeenLastCalledWith("viseme_sil", 1);
    expect(onStateChange).toHaveBeenLastCalledWith(false, request);
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
    await synthStarted;
    player.stopPlayback();
    player.cancelTts();
    await speaking;

    expect(context.sources).toHaveLength(0);
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
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });

    await expect(player.speak(request)).rejects.toThrow(
      "Speech playback received a stale or out-of-order chunk.",
    );
    expect(context.sources).toHaveLength(0);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("stops superseded playback before requesting the replacement", async () => {
    const contexts: FakeAudioContext[] = [];
    let replacementStartedAfterStop = false;
    const provider = createProvider(async function* (speechRequest) {
      if (speechRequest.speechId === "replacement") {
        replacementStartedAfterStop =
          contexts[0]?.sources[0]?.stop.mock.calls.length === 1;
      }
      yield audioChunk({
        sessionId: speechRequest.sessionId,
        speechId: speechRequest.speechId,
      });
    });
    const player = createSpeechPlaybackController({
      provider,
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => {
        const context = new FakeAudioContext();
        contexts.push(context);
        return context as unknown as SpeechAudioContext;
      },
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });
    const firstRequest = request;
    const replacementRequest = { ...request, speechId: "replacement" };
    const first = player.speak(firstRequest);
    await vi.waitFor(() => expect(contexts[0]?.sources).toHaveLength(1));

    const replacement = player.speak(replacementRequest);
    await vi.waitFor(() => expect(contexts[1]?.sources).toHaveLength(1));
    expect(replacementStartedAfterStop).toBe(true);
    expect(contexts[0]?.sources[0]?.stop).toHaveBeenCalledOnce();

    contexts[1]?.sources[0]?.finish();
    await Promise.all([first, replacement]);
  });

  it("begins playing completed sentence chunks while later chunks synthesize", async () => {
    const context = new FakeAudioContext();
    let secondChunkStarted: (() => void) | undefined;
    const secondStarted = new Promise<void>((resolve) => {
      secondChunkStarted = resolve;
    });
    let chunkCount = 0;
    const provider = createProvider(async function* (speechRequest, signal) {
      chunkCount += 1;
      if (chunkCount === 2) {
        secondChunkStarted?.();
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
        signal.throwIfAborted();
      }
      yield audioChunk({
        sessionId: speechRequest.sessionId,
        speechId: speechRequest.speechId,
      });
    });
    const player = createSpeechPlaybackController({
      provider,
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => context as unknown as SpeechAudioContext,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });
    const longRequest = {
      ...request,
      text: "First sentence has a few words. ".repeat(15) +
        "The second sentence is spoken after the first one.",
    };

    const speaking = player.speak(longRequest);
    await secondStarted;
    expect(context.sources).toHaveLength(1);
    player.stopPlayback();
    player.cancelTts();
    await speaking;
    expect(context.sources[0]?.stop).toHaveBeenCalledOnce();
  });

  it("uses only configured fallback providers and reports all-source failure", async () => {
    const context = new FakeAudioContext();
    const primary = createProvider(async function* () {
      throw new Error("Primary TTS is unavailable.");
    });
    const fallback = createProvider(async function* (speechRequest) {
      yield audioChunk({
        sessionId: speechRequest.sessionId,
        speechId: speechRequest.speechId,
      });
    });
    const player = createSpeechPlaybackController({
      provider: primary,
      fallbackProviders: [fallback],
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => context as unknown as SpeechAudioContext,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    });

    const speaking = player.speak(request);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    context.sources[0]?.finish();
    await speaking;

    const unavailable = createProvider(async function* () {
      throw new Error("Only configured source failed.");
    });
    const noFallback = createSpeechPlaybackController({
      provider: unavailable,
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => new FakeAudioContext() as unknown as SpeechAudioContext,
    });
    await expect(noFallback.speak(request)).rejects.toThrow(
      "Only configured source failed.",
    );

    const backup = createProvider(async function* () {
      throw new Error("Configured backup also failed.");
    });
    const allUnavailable = createSpeechPlaybackController({
      provider: unavailable,
      fallbackProviders: [backup],
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => new FakeAudioContext() as unknown as SpeechAudioContext,
    });
    await expect(allUnavailable.speak(request)).rejects.toThrow(
      "test-tts: Only configured source failed.; test-tts: Configured backup also failed.",
    );
  });

  it("aligns synthesized audio and reports the active word by playback time", async () => {
    const context = new FakeAudioContext();
    const onWordChange = vi.fn();
    const alignAudio = vi.fn(
      async (
        _text: string,
        _language: string,
        audio: Blob,
      ) => {
        expect(audio.type).toBe("audio/wav");
        const wav = new Uint8Array(await audio.arrayBuffer());
        expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
        expect(new DataView(wav.buffer).getUint32(24, true)).toBe(22050);
        return [
          { word: "Goedemorgen", start: 0.1, end: 0.5 },
          { word: "allemaal", start: 0.5, end: 0.9 },
        ];
      },
    );
    let animationFrame: FrameRequestCallback | undefined;
    const player = createSpeechPlaybackController({
      provider: createProvider(async function* (speechRequest) {
        yield audioChunk({
          sessionId: speechRequest.sessionId,
          speechId: speechRequest.speechId,
        });
      }),
      alignAudio,
      onWordChange,
      getAvatarController: () => undefined,
      isListening: () => false,
      createAudioContext: () => context as unknown as SpeechAudioContext,
      requestFrame: vi.fn((callback) => {
        animationFrame = callback;
        return 1;
      }),
      cancelFrame: vi.fn(),
    });

    const speaking = player.speak(request);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    context.currentTime = 1.2;
    animationFrame?.(0);
    expect(onWordChange).toHaveBeenLastCalledWith(0, request);

    context.currentTime = 1.8;
    animationFrame?.(16);
    expect(onWordChange).toHaveBeenLastCalledWith(1, request);

    context.sources[0]?.finish();
    await speaking;
    expect(onWordChange).toHaveBeenLastCalledWith(undefined, request);
    expect(alignAudio).toHaveBeenCalledOnce();
  });
});
