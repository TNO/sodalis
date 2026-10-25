import type { AvatarController } from "@sodalis/avatar";
import {
  DEFAULT_TTS_CHUNK_CHARACTERS,
  DEFAULT_TTS_CHUNK_PAUSE_MS,
  splitSpeechText,
} from "@sodalis/speech";
import type {
  ActiveSpeechOutput,
  SpeechRequest,
  SpeechWordTimestamp,
  TextToSpeechProvider,
} from "@sodalis/speech";
import { AmplitudeLipSyncAdapter } from "./AmplitudeLipSyncAdapter.js";

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
  readonly fallbackProviders?: readonly TextToSpeechProvider[];
  readonly alignAudio?: (
    text: string,
    language: string,
    audio: Blob,
    signal: AbortSignal,
  ) => Promise<readonly SpeechWordTimestamp[]>;
  readonly getAvatarController: () => Pick<
    AvatarController,
    "setState" | "setViseme"
  > | undefined;
  readonly isListening: () => boolean;
  readonly onOutputChange?: (active: boolean) => void;
  readonly onStateChange?: (
    speaking: boolean,
    request: SpeechRequest,
  ) => void;
  readonly onWordChange?: (
    wordIndex: number | undefined,
    request: SpeechRequest,
  ) => void;
  readonly onAlignmentError?: (error: Error, request: SpeechRequest) => void;
  readonly onCancelGeneration?: () => void;
  readonly onLatency?: (metric: SpeechPlaybackLatency) => void;
  readonly createAudioContext?: () => SpeechAudioContext;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly now?: () => number;
}

export interface SpeechPlaybackController extends ActiveSpeechOutput {
  speak(request: SpeechRequest, signal?: AbortSignal): Promise<void>;
  dispose(): void;
}

interface ActivePlayback {
  readonly request: SpeechRequest;
  readonly context: SpeechAudioContext;
  readonly abortController: AbortController;
  readonly sources: Set<SpeechAudioSource>;
  readonly endedSources: Promise<void>[];
  analyser?: SpeechAnalyser;
  lipSync?: AmplitudeLipSyncAdapter;
  nextStartTime: number;
  frameHandle?: number;
  audioStartTime?: number;
  wordTimestamps: readonly TimedSpeechWord[];
  activeWordIndex?: number;
  speaking: boolean;
  stopped: boolean;
  cancellationStartedAt?: number;
}

interface TimedSpeechWord extends SpeechWordTimestamp {
  readonly wordIndex: number;
}

interface SynthesizedSpeechChunk {
  readonly pcm: Uint8Array;
  readonly sampleRate: number;
  readonly wordTimestamps: readonly SpeechWordTimestamp[];
  readonly firstAudioReceivedAt: number;
}

class SpeechChunkProtocolError extends Error {}

function createAudioContext(): SpeechAudioContext {
  if (typeof globalThis.AudioContext !== "function") {
    throw new Error("Web Audio is unavailable in this browser.");
  }
  return new globalThis.AudioContext();
}

function mergeAudioChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const merged = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function createWaveBlob(pcm: Uint8Array, sampleRate: number): Blob {
  if (pcm.byteLength % 2 !== 0) {
    throw new Error("Speech playback received an incomplete PCM sample.");
  }
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      wav[offset + index] = value.charCodeAt(index);
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return new Blob([wav], { type: "audio/wav" });
}

function activeWordIndexAt(
  timestamps: readonly TimedSpeechWord[],
  time: number,
): number | undefined {
  return timestamps.find(
    (timestamp) => timestamp.start <= time && time < timestamp.end,
  )?.wordIndex;
}

function countSpeechWords(text: string): number {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].length;
}

async function synthesizeSpeechChunk(
  providers: readonly TextToSpeechProvider[],
  request: SpeechRequest,
  signal: AbortSignal,
  now: () => number,
): Promise<SynthesizedSpeechChunk> {
  const providerErrors: Error[] = [];
  for (const provider of providers) {
    const chunks: Uint8Array[] = [];
    const wordTimestamps: SpeechWordTimestamp[] = [];
    let sampleRate: number | undefined;
    let firstAudioReceivedAt: number | undefined;
    let expectedSequence = 0;
    try {
      for await (const chunk of provider.speak(request, signal)) {
        signal.throwIfAborted();
        if (
          chunk.sessionId !== request.sessionId ||
          chunk.speechId !== request.speechId ||
          chunk.sequence !== expectedSequence
        ) {
          throw new SpeechChunkProtocolError(
            "Speech playback received a stale or out-of-order chunk.",
          );
        }
        expectedSequence += 1;
        if (chunk.type === "timing") {
          if (chunk.kind === "word") {
            const start = chunk.startMs / 1000;
            const end = chunk.endMs / 1000;
            if (
              !chunk.value.trim() ||
              !Number.isFinite(start) ||
              !Number.isFinite(end) ||
              start < 0 ||
              end < start ||
              (wordTimestamps.at(-1)?.start ?? -1) > start
            ) {
              throw new Error("Speech provider returned invalid word timings.");
            }
            wordTimestamps.push({ word: chunk.value, start, end });
          }
          continue;
        }

        const chunkSampleRate = pcmSampleRate(chunk.mimeType);
        if (sampleRate !== undefined && sampleRate !== chunkSampleRate) {
          throw new Error("Speech provider changed PCM sample rate mid-stream.");
        }
        sampleRate = chunkSampleRate;
        if (!chunk.data.byteLength) continue;
        firstAudioReceivedAt ??= now();
        chunks.push(chunk.data);
      }
      if (!chunks.length || sampleRate === undefined || firstAudioReceivedAt === undefined) {
        throw new Error("Speech provider returned no audio.");
      }
      return {
        pcm: mergeAudioChunks(chunks),
        sampleRate,
        wordTimestamps,
        firstAudioReceivedAt,
      };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof SpeechChunkProtocolError) throw error;
      providerErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (providerErrors.length === 1) throw providerErrors[0];
  throw new Error(
    `Speech synthesis failed for configured providers: ${providers
      .map((provider, index) =>
        `${provider.id}: ${providerErrors[index]?.message ?? "failed"}`,
      )
      .join("; ")}`,
    { cause: providerErrors.at(-1) },
  );
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
    if (!playback.analyser) return;
    const samples = new Uint8Array(playback.analyser.fftSize);
    const update = () => {
      if (active !== playback || playback.stopped || !playback.analyser) return;
      playback.analyser.getByteTimeDomainData(samples);
      playback.lipSync?.update(audioRms(samples));
      if (playback.audioStartTime !== undefined) {
        const wordIndex = activeWordIndexAt(
          playback.wordTimestamps,
          playback.context.currentTime - playback.audioStartTime,
        );
        if (wordIndex !== playback.activeWordIndex) {
          playback.activeWordIndex = wordIndex;
          options.onWordChange?.(wordIndex, playback.request);
        }
      }
      playback.frameHandle = requestFrame(update);
    };
    playback.frameHandle = requestFrame(update);
  };

  const speak = async (
    request: SpeechRequest,
    signal?: AbortSignal,
  ): Promise<void> => {
    if (disposed) throw new Error("Speech playback has been disposed.");
    signal?.throwIfAborted();
    if (active) {
      stopPlayback();
      cancelTts();
    }

    const context = createContext();
    const playback: ActivePlayback = {
      request,
      context,
      abortController: new AbortController(),
      sources: new Set(),
      endedSources: [],
      nextStartTime: context.currentTime,
      wordTimestamps: [],
      speaking: false,
      stopped: false,
    };
    active = playback;
    options.onOutputChange?.(true);
    const cancelForSignal = () => {
      if (active !== playback) return;
      stopPlayback();
      cancelTts();
    };
    signal?.addEventListener("abort", cancelForSignal, { once: true });
    if (signal?.aborted) cancelForSignal();

    let streamFailed = false;
    try {
      await context.resume();
      playback.abortController.signal.throwIfAborted();
      playback.analyser = context.createAnalyser();
      playback.analyser.fftSize = 256;
      playback.analyser.connect(context.destination);
      const avatar = options.getAvatarController();
      if (avatar) playback.lipSync = new AmplitudeLipSyncAdapter(avatar);

      const textChunks = splitSpeechText(
        request.text,
        DEFAULT_TTS_CHUNK_CHARACTERS,
      );
      if (!textChunks.length) {
        throw new Error("Speech request contains no speakable text.");
      }
      const providers = [options.provider, ...(options.fallbackProviders ?? [])];
      const playbackStartTime = context.currentTime;
      let sourceWordOffset = 0;
      let firstAudioPlayed = false;

      for (const [chunkIndex, text] of textChunks.entries()) {
        playback.abortController.signal.throwIfAborted();
        if (playback.stopped) return;
        const chunkRequest = { ...request, text };
        const synthesized = await synthesizeSpeechChunk(
          providers,
          chunkRequest,
          playback.abortController.signal,
          now,
        );
        const buffer = createAudioBuffer(
          context,
          synthesized.pcm,
          synthesized.sampleRate,
        );
        let wordTimestamps = [...synthesized.wordTimestamps];
        if (!wordTimestamps.length && options.alignAudio) {
          try {
            wordTimestamps = [
              ...(await options.alignAudio(
                text,
                request.language,
                createWaveBlob(synthesized.pcm, synthesized.sampleRate),
                playback.abortController.signal,
              )),
            ];
          } catch (error) {
            playback.abortController.signal.throwIfAborted();
            options.onAlignmentError?.(
              error instanceof Error ? error : new Error(String(error)),
              request,
            );
          }
        }
        playback.abortController.signal.throwIfAborted();
        if (playback.stopped) return;

        const startAt = Math.max(playback.nextStartTime, context.currentTime);
        if (playback.audioStartTime === undefined) {
          playback.audioStartTime = startAt;
        }
        const elapsedBeforeChunk = startAt - playbackStartTime;
        playback.wordTimestamps = [
          ...playback.wordTimestamps,
          ...wordTimestamps.map((timestamp, index) => ({
            ...timestamp,
            start: timestamp.start + elapsedBeforeChunk,
            end: timestamp.end + elapsedBeforeChunk,
            wordIndex: sourceWordOffset + index,
          })),
        ];
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
        source.start(startAt);
        playback.nextStartTime = startAt + buffer.duration +
          (chunkIndex < textChunks.length - 1
            ? DEFAULT_TTS_CHUNK_PAUSE_MS / 1000
            : 0);
        playback.endedSources.push(sourceEnded);
        sourceWordOffset += countSpeechWords(text);

        if (!firstAudioPlayed) {
          firstAudioPlayed = true;
          playback.speaking = true;
          setAvatarState(true);
          options.onStateChange?.(true, request);
          startLipSync(playback);
          options.onLatency?.({
            sessionId: request.sessionId,
            speechId: request.speechId,
            type: "first-audio-to-playback",
            latencyMs: Math.max(0, now() - synthesized.firstAudioReceivedAt),
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
      signal?.removeEventListener("abort", cancelForSignal);
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
        if (playback.activeWordIndex !== undefined) {
          options.onWordChange?.(undefined, request);
        }
        if (playback.speaking) {
          setAvatarState(false);
          options.onStateChange?.(false, request);
        }
      }
    }
  };

  return {
    speak,
    stopPlayback,
    cancelTts,
    cancelGeneration() {
      options.onCancelGeneration?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPlayback();
      cancelTts();
    },
  };
}
