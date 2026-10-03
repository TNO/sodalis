import {
  AVATAR_VISEMES,
  type AvatarViseme,
  type MockVisemeSequence,
} from "../index.js";

const DEFAULT_DURATION_SECONDS = 2.4;
const FRAME_INTERVAL_SECONDS = 0.18;
const MAX_DURATION_SECONDS = 30;
const MAX_KEYFRAME_COUNT = 512;
const ARTICULATED_VISEMES = AVATAR_VISEMES.filter(
  (viseme) => viseme !== "viseme_sil",
);

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function validateSequence(sequence: MockVisemeSequence): void {
  if (
    typeof sequence !== "object" ||
    sequence === null ||
    !Array.isArray(sequence.keyframes)
  ) {
    throw new RangeError("Mock viseme sequence must contain keyframes.");
  }
  if (
    !Number.isFinite(sequence.durationSeconds) ||
    sequence.durationSeconds <= 0 ||
    sequence.durationSeconds > MAX_DURATION_SECONDS ||
    sequence.keyframes.length < 2
  ) {
    throw new RangeError(
      `Mock viseme sequence must have a duration from zero to ${MAX_DURATION_SECONDS} seconds and at least two keyframes.`,
    );
  }
  if (sequence.keyframes.length > MAX_KEYFRAME_COUNT) {
    throw new RangeError(
      `Mock viseme sequence cannot exceed ${MAX_KEYFRAME_COUNT} keyframes.`,
    );
  }

  if (
    sequence.keyframes[0]?.atSeconds !== 0 ||
    sequence.keyframes.at(-1)?.atSeconds !== sequence.durationSeconds
  ) {
    throw new RangeError(
      "Mock viseme sequence must start at zero and end at its duration.",
    );
  }

  let previousTime = -1;
  for (const keyframe of sequence.keyframes) {
    if (
      !Number.isFinite(keyframe.atSeconds) ||
      keyframe.atSeconds <= previousTime ||
      !AVATAR_VISEMES.includes(keyframe.viseme) ||
      !Number.isFinite(keyframe.weight) ||
      keyframe.weight < 0 ||
      keyframe.weight > 1
    ) {
      throw new RangeError("Mock viseme sequence contains an invalid keyframe.");
    }
    previousTime = keyframe.atSeconds;
  }
}

export function createMockVisemeSequence(
  seed = 1,
  durationSeconds = DEFAULT_DURATION_SECONDS,
): MockVisemeSequence {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Mock viseme seed must be an unsigned 32-bit integer.");
  }
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    throw new RangeError(
      `Mock viseme duration must be positive and no greater than ${MAX_DURATION_SECONDS} seconds.`,
    );
  }

  const random = createRandom(seed);
  const frameCount = Math.max(
    3,
    Math.ceil(durationSeconds / FRAME_INTERVAL_SECONDS),
  );
  const keyframes = [
    { atSeconds: 0, viseme: "viseme_sil" as const, weight: 1 },
    ...Array.from({ length: frameCount - 1 }, (_, index) => {
      const atSeconds = (durationSeconds * (index + 1)) / frameCount;
      const viseme =
        ARTICULATED_VISEMES[
          Math.floor(random() * ARTICULATED_VISEMES.length)
        ]!;
      return {
        atSeconds,
        viseme,
        weight: 0.35 + random() * 0.45,
      };
    }),
    {
      atSeconds: durationSeconds,
      viseme: "viseme_sil" as const,
      weight: 1,
    },
  ];

  return Object.freeze({
    durationSeconds,
    keyframes: Object.freeze(keyframes),
  });
}

export function sampleMockVisemeSequence(
  sequence: MockVisemeSequence,
  elapsedSeconds: number,
): Readonly<Record<AvatarViseme, number>> {
  validateSequence(sequence);
  if (!Number.isFinite(elapsedSeconds)) {
    throw new RangeError("Mock viseme time must be a finite number.");
  }

  const time = Math.min(sequence.durationSeconds, Math.max(0, elapsedSeconds));
  let nextIndex = sequence.keyframes.findIndex(
    (keyframe) => keyframe.atSeconds >= time,
  );
  if (nextIndex <= 0) nextIndex = 1;
  const from = sequence.keyframes[nextIndex - 1]!;
  const to = sequence.keyframes[nextIndex]!;
  const progress =
    (time - from.atSeconds) / (to.atSeconds - from.atSeconds);
  const weights = Object.fromEntries(
    AVATAR_VISEMES.map((viseme) => [viseme, 0]),
  ) as Record<AvatarViseme, number>;
  weights[from.viseme] += from.weight * (1 - progress);
  weights[to.viseme] += to.weight * progress;
  return weights;
}
