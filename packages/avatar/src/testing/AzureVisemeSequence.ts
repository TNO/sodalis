import type {
  AvatarViseme,
  MockVisemeKeyframe,
  MockVisemeSequence,
} from "../index.js";

/** One Azure Speech viseme event: an id from 0 to 21 at an audio offset. */
export interface AzureVisemeEvent {
  readonly id: number;
  readonly offsetMs: number;
}

/**
 * Azure's 22 viseme ids (Disney-style, see "Get facial position with viseme"
 * in the Azure Speech docs) mapped to the nearest TalkingHead/Oculus viseme.
 */
const AZURE_TO_AVATAR: readonly AvatarViseme[] = [
  "viseme_sil", // 0 silence
  "viseme_aa", // 1 æ ə ʌ
  "viseme_aa", // 2 ɑ
  "viseme_O", // 3 ɔ
  "viseme_E", // 4 ɛ ʊ
  "viseme_RR", // 5 ɝ
  "viseme_I", // 6 j i ɪ
  "viseme_U", // 7 w u
  "viseme_O", // 8 o
  "viseme_aa", // 9 aʊ
  "viseme_O", // 10 ɔɪ
  "viseme_aa", // 11 aɪ
  "viseme_kk", // 12 h (and Dutch g/ch)
  "viseme_RR", // 13 ɹ
  "viseme_nn", // 14 l
  "viseme_SS", // 15 s z
  "viseme_CH", // 16 ʃ tʃ dʒ ʒ
  "viseme_TH", // 17 ð
  "viseme_FF", // 18 f v
  "viseme_DD", // 19 d t n θ
  "viseme_kk", // 20 k g ŋ
  "viseme_PP", // 21 p b m
];

const SPOKEN_WEIGHT = 0.85;
const MAX_DURATION_SECONDS = 30;
const MAX_KEYFRAME_COUNT = 512;

/**
 * Builds a playable viseme sequence from Azure TTS viseme events, so lip sync
 * follows the recorded audio instead of estimated text timing.
 */
export function createAzureVisemeSequence(
  events: readonly AzureVisemeEvent[],
  durationMs: number,
): MockVisemeSequence {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError("Audio duration must be positive.");
  }
  const durationSeconds = durationMs / 1000;
  if (durationSeconds > MAX_DURATION_SECONDS) {
    throw new RangeError(`Audio is longer than ${MAX_DURATION_SECONDS} seconds.`);
  }

  const byOffset = new Map<number, AvatarViseme>();
  for (const event of events) {
    const viseme = AZURE_TO_AVATAR[event.id];
    if (!Number.isInteger(event.id) || !viseme) {
      throw new RangeError(`Unknown Azure viseme id ${event.id}.`);
    }
    if (event.offsetMs > 0 && event.offsetMs < durationMs) {
      byOffset.set(event.offsetMs, viseme);
    }
  }

  const keyframes: MockVisemeKeyframe[] = [
    { atSeconds: 0, viseme: "viseme_sil", weight: 1 },
  ];
  for (const [offsetMs, viseme] of [...byOffset].sort(([a], [b]) => a - b)) {
    if (keyframes.at(-1)?.viseme === viseme) continue;
    keyframes.push({
      atSeconds: offsetMs / 1000,
      viseme,
      weight: viseme === "viseme_sil" ? 1 : SPOKEN_WEIGHT,
    });
  }
  keyframes.push({ atSeconds: durationSeconds, viseme: "viseme_sil", weight: 1 });

  if (keyframes.length > MAX_KEYFRAME_COUNT) {
    throw new RangeError(`Clip has more than ${MAX_KEYFRAME_COUNT} visemes.`);
  }
  return Object.freeze({ durationSeconds, keyframes: Object.freeze(keyframes) });
}
