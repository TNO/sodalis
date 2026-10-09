export interface VoiceActivityEvent {
  readonly type: "speech-start" | "speech-end";
  readonly timestampMs: number;
}

export interface VoiceActivityDetector {
  process(samples: Float32Array, timestampMs: number): readonly VoiceActivityEvent[];
  reset(): void;
}

export interface EnergyVoiceActivityDetectorOptions {
  thresholdRms?: number;
  startFrames?: number;
  endFrames?: number;
}

const DEFAULT_THRESHOLD_RMS = 0.045;
const DEFAULT_START_FRAMES = 2;
// 35 frames * 20ms = 700ms hangover, long enough to survive natural
// inter-word/sentence pauses without splitting one utterance into many.
const DEFAULT_END_FRAMES = 35;

export function createEnergyVoiceActivityDetector(
  options: EnergyVoiceActivityDetectorOptions = {},
): VoiceActivityDetector {
  const thresholdRms = options.thresholdRms ?? DEFAULT_THRESHOLD_RMS;
  const startFrames = options.startFrames ?? DEFAULT_START_FRAMES;
  const endFrames = options.endFrames ?? DEFAULT_END_FRAMES;
  if (!Number.isFinite(thresholdRms) || thresholdRms <= 0 || thresholdRms > 1) {
    throw new RangeError(
      "VAD thresholdRms must be a finite number greater than zero.",
    );
  }
  if (!Number.isInteger(startFrames) || startFrames < 1) {
    throw new RangeError("VAD startFrames must be a positive integer.");
  }
  if (!Number.isInteger(endFrames) || endFrames < 1) {
    throw new RangeError("VAD endFrames must be a positive integer.");
  }

  let speaking = false;
  let consecutiveSpeechFrames = 0;
  let consecutiveSilenceFrames = 0;

  const reset = () => {
    speaking = false;
    consecutiveSpeechFrames = 0;
    consecutiveSilenceFrames = 0;
  };

  return {
    process(samples, timestampMs) {
      if (!Number.isFinite(timestampMs)) {
        throw new RangeError("VAD timestamps must be finite.");
      }
      let sumSquares = 0;
      for (const sample of samples) sumSquares += sample * sample;
      const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0;

      if (rms >= thresholdRms) {
        consecutiveSilenceFrames = 0;
        if (speaking) return [];
        consecutiveSpeechFrames += 1;
        if (consecutiveSpeechFrames >= startFrames) {
          speaking = true;
          consecutiveSpeechFrames = 0;
          return [{ type: "speech-start", timestampMs }];
        }
        return [];
      }

      consecutiveSpeechFrames = 0;
      if (!speaking) return [];
      consecutiveSilenceFrames += 1;
      if (consecutiveSilenceFrames >= endFrames) {
        speaking = false;
        consecutiveSilenceFrames = 0;
        return [{ type: "speech-end", timestampMs }];
      }
      return [];
    },
    reset,
  };
}
