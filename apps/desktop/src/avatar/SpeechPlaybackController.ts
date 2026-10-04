import type { AvatarController } from "@sodalis/avatar";
import type {
  ActiveSpeechOutput,
  SpeechRequest,
  TextToSpeechProvider,
} from "@sodalis/speech";
import {
  AmplitudeLipSyncAdapter,
  type LipSyncAvatar,
} from "./AmplitudeLipSyncAdapter.js";

export type SpeechAudioBuffer = AudioBuffer;
export type SpeechAudioSource = AudioBufferSourceNode;
export type SpeechAnalyser = AnalyserNode;
export type SpeechAudioContext = AudioContext;

export interface SpeechPlaybackLatency {
  readonly sessionId: string;
  readonly speechId: string;
  readonly type: "first-audio-to-playback" | "cancellation-to-silence";
  readonly latencyMs: number;
}

export interface SpeechPlaybackControllerOptions {
  readonly provider: TextToSpeechProvider;
  readonly getAvatarController: () => Pick<
    AvatarController,
    "setState" | "setViseme"
  > | undefined;
  readonly isListening: () => boolean;
  readonly onOutputChange?: (active: boolean) => void;
  readonly onStateChange?: (speaking: boolean) => void;
  readonly onLatency?: (metric: SpeechPlaybackLatency) => void;
  readonly createAudioContext?: () => SpeechAudioContext;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly now?: () => number;
}

export interface SpeechPlaybackController extends ActiveSpeechOutput {
  speak(request: SpeechRequest): Promise<void>;
  dispose(): void;
}

interface ActivePlayback {
  readonly context: SpeechAudioContext;
  readonly abortController: AbortController;
  readonly sources: Set<SpeechAudioSource>;
  readonly endedSources: Promise<void>[];
  analyser?: SpeechAnalyser;
  lipSync?: AmplitudeLipSyncAdapter;
  nextStartTime: number;
  frameHandle?: number;
  speaking: boolean;
  stopped: boolean;
  cancellationStartedAt?: number;
}

function createAudioContext(): SpeechAudioContext {
  if (typeof globalThis.AudioContext !== "function") {
    throw new Error("Web Audio is unavailable in this browser.");
  }
  return new globalThis.AudioContext();
}

function pcmSampleRate(mimeType: string): number {
  const [mediaType, ...rawParameters] = mimeType
    .toLowerCase()
    .split(";")
    .map((part) => part.trim());
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
  const sampleRate = Number(parameters.get("rate"));
  if (
    mediaType !== "audio/pcm" ||
    parameters.get("bits") !== "16" ||
    parameters.get("channels") !== "1" ||
    parameters.get("endianness") !== "little" ||
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0
  ) {
    throw new Error("Speech playback received an unsupported PCM format.");
  }
  return sampleRate;
}

function createAudioBuffer(
  context: SpeechAudioContext,
  data: Uint8Array,
  sampleRate: number,
): SpeechAudioBuffer {
  if (!data.byteLength || data.byteLength % 2 !== 0) {
    throw new Error("Speech playback received an incomplete PCM sample.");
  }
  const sampleCount = data.byteLength / 2;
  const buffer = context.createBuffer(1, sampleCount, sampleRate);
  const samples = buffer.getChannelData(0);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return buffer;
}

function audioRms(samples: Uint8Array): number {
  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

export function createSpeechPlaybackController(
  options: SpeechPlaybackControllerOptions,
): SpeechPlaybackController {
  const now = options.now ?? (() => performance.now());
  const createContext = options.createAudioContext ?? createAudioContext;
  const requestFrame =
    options.requestFrame ??
    ((callback: FrameRequestCallback) => requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle));
  let active: ActivePlayback | undefined;
  let disposed = false;

  const setAvatarState = (speaking: boolean) => {
    const avatar = options.getAvatarController();
    if (!avatar) return;
    avatar.setState(
      speaking ? "speaking" : options.isListening() ? "listening" : "idle",
    );
  };

  const stopAnimation = (playback: ActivePlayback) => {
    if (playback.frameHandle === undefined) return;
    cancelFrame(playback.frameHandle);
    playback.frameHandle = undefined;
  };

  const stopSources = (playback: ActivePlayback) => {
    for (const source of playback.sources) {
      try {
        source.stop();
      } catch (error) {
        console.error("Unable to stop a speech audio source:", error);
      }
    }
  };

  const stopPlayback = () => {
    const playback = active;
    if (!playback || playback.stopped) return;
    playback.stopped = true;
    playback.cancellationStartedAt = now();
    stopAnimation(playback);
    playback.lipSync?.reset();
    stopSources(playback);
  };

  const cancelTts = () => {
    const playback = active;
    if (!playback || playback.abortController.signal.aborted) return;
    playback.abortController.abort(
      new DOMException("Speech synthesis was cancelled.", "AbortError"),
    );
  };

  const startLipSync = (playback: ActivePlayback) => {
    if (!playback.analyser || !playback.lipSync) return;
    const samples = new Uint8Array(playback.analyser.fftSize);
    const update = () => {
      if (active !== playback || playback.stopped || !playback.analyser) return;
      playback.analyser.getByteTimeDomainData(samples);
      playback.lipSync?.update(audioRms(samples));
      playback.frameHandle = requestFrame(update);
    };
    playback.frameHandle = requestFrame(update);
  };

  const speak = async (request: SpeechRequest): Promise<void> => {
    if (disposed) throw new Error("Speech playback has been disposed.");
    if (active) {
      stopPlayback();
      cancelTts();
    }

    const context = createContext();
    const playback: ActivePlayback = {
      context,
      abortController: new AbortController(),
      sources: new Set(),
      endedSources: [],
      nextStartTime: context.currentTime,
      speaking: false,
      stopped: false,
    };
    active = playback;
    options.onOutputChange?.(true);

    let streamFailed = false;
    try {
      await context.resume();
      playback.abortController.signal.throwIfAborted();
      playback.analyser = context.createAnalyser();
      playback.analyser.fftSize = 256;
      playback.analyser.connect(context.destination);
      const avatar = options.getAvatarController();
      if (avatar) playback.lipSync = new AmplitudeLipSyncAdapter(avatar);

      let expectedSequence = 0;
      for await (const chunk of options.provider.speak(
        request,
        playback.abortController.signal,
      )) {
        playback.abortController.signal.throwIfAborted();
        if (
          chunk.sessionId !== request.sessionId ||
          chunk.speechId !== request.speechId ||
          chunk.sequence !== expectedSequence
        ) {
          throw new Error("Speech playback received a stale or out-of-order chunk.");
        }
        expectedSequence += 1;
        if (chunk.type !== "audio") continue;

        const receivedAt = now();
        const sampleRate = pcmSampleRate(chunk.mimeType);
        const buffer = createAudioBuffer(context, chunk.data, sampleRate);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(playback.analyser);
        const sourceEnded = new Promise<void>((resolve) => {
          source.onended = () => {
            playback.sources.delete(source);
            resolve();
          };
        });
        playback.sources.add(source);
        const startAt = Math.max(
          playback.nextStartTime,
          context.currentTime,
        );
        source.start(startAt);
        playback.nextStartTime = startAt + buffer.duration;
        playback.endedSources.push(sourceEnded);

        if (!playback.speaking) {
          playback.speaking = true;
          setAvatarState(true);
          options.onStateChange?.(true);
          startLipSync(playback);
          options.onLatency?.({
            sessionId: request.sessionId,
            speechId: request.speechId,
            type: "first-audio-to-playback",
            latencyMs: Math.max(0, now() - receivedAt),
          });
        }
      }

      await Promise.all(playback.endedSources);
    } catch (error) {
      if (!playback.abortController.signal.aborted) {
        streamFailed = true;
        throw error;
      }
    } finally {
      if (streamFailed || playback.stopped) stopSources(playback);
      stopAnimation(playback);
      playback.lipSync?.reset();
      if (context.state !== "closed") await context.close();

      if (playback.cancellationStartedAt !== undefined) {
        options.onLatency?.({
          sessionId: request.sessionId,
          speechId: request.speechId,
          type: "cancellation-to-silence",
          latencyMs: Math.max(0, now() - playback.cancellationStartedAt),
        });
      }
      if (active === playback) {
        active = undefined;
        options.onOutputChange?.(false);
        if (playback.speaking) {
          setAvatarState(false);
          options.onStateChange?.(false);
        }
      }
    }
  };

  return {
    speak,
    stopPlayback,
    cancelTts,
    cancelGeneration() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPlayback();
      cancelTts();
    },
  };
}
