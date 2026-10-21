import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";
import {
  AVATAR_VISEMES,
  type AvatarViseme,
  type MockVisemeSequence,
} from "../index.js";

export interface TextVisemeSequenceOptions {
  /** Length of one TalkingHead relative viseme unit; about 0.075 s at normal speech. */
  secondsPerUnit?: number;
}

const DEFAULT_SECONDS_PER_UNIT = 0.075;
const EDGE_UNITS = 0.5;
const PAUSE_UNITS = 0.5;
const MAX_DURATION_SECONDS = 30;
const MAX_KEYFRAME_COUNT = 512;

let lipsync: LipsyncEn | undefined;

function toViseme(code: string): AvatarViseme {
  const viseme = `viseme_${code}`;
  const match = AVATAR_VISEMES.find((candidate) => candidate === viseme);
  if (!match) throw new RangeError(`Unknown lip-sync viseme "${code}".`);
  return match;
}

/**
 * Builds a playable viseme sequence from English text with TalkingHead's
 * rule-based lip-sync, for evaluating mouth shapes without a speech service.
 */
export function createTextVisemeSequence(
  text: string,
  options: TextVisemeSequenceOptions = {},
): MockVisemeSequence {
  const secondsPerUnit = options.secondsPerUnit ?? DEFAULT_SECONDS_PER_UNIT;
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) {
    throw new RangeError("Seconds per viseme unit must be positive.");
  }
  lipsync ??= new LipsyncEn();
  const { visemes, times, durations } = lipsync.wordsToVisemes(
    lipsync.preProcessText(text),
  );
  if (visemes.length === 0) {
    throw new RangeError("Text has no speakable words.");
  }

  const at = (units: number) => (EDGE_UNITS + units) * secondsPerUnit;
  const keyframes: { atSeconds: number; viseme: AvatarViseme; weight: number }[] =
    [{ atSeconds: 0, viseme: "viseme_sil", weight: 1 }];
  visemes.forEach((code, index) => {
    const start = times[index] ?? 0;
    const end = start + (durations[index] ?? 1);
    keyframes.push({ atSeconds: at(start), viseme: toViseme(code), weight: 0.85 });
    const next = times[index + 1];
    if (next !== undefined && next - end > PAUSE_UNITS) {
      keyframes.push({ atSeconds: at(end), viseme: "viseme_sil", weight: 1 });
      keyframes.push({ atSeconds: at(next - PAUSE_UNITS / 2), viseme: "viseme_sil", weight: 1 });
    }
  });
  const lastIndex = visemes.length - 1;
  const durationSeconds = at(
    (times[lastIndex] ?? 0) + (durations[lastIndex] ?? 1) + EDGE_UNITS,
  );
  keyframes.push({ atSeconds: durationSeconds, viseme: "viseme_sil", weight: 1 });

  if (
    durationSeconds > MAX_DURATION_SECONDS ||
    keyframes.length > MAX_KEYFRAME_COUNT
  ) {
    throw new RangeError(
      `Text is too long to play; keep it under ${MAX_DURATION_SECONDS} seconds.`,
    );
  }
  return Object.freeze({ durationSeconds, keyframes: Object.freeze(keyframes) });
}
