import type {
  MockVisemeKeyframe,
  MockVisemeSequence,
  SpeechViseme,
} from "../index.js";

/** One Azure Speech viseme event: an id from 0 to 21 at an audio offset. */
export interface AzureVisemeEvent {
  readonly id: number;
  readonly offsetMs: number;
}

/**
 * Azure's 22 viseme ids (Disney-style, see "Get facial position with viseme"
 * in the Azure Speech docs) mapped to avatar visemes. Diphthongs glide from
 * the first shape to the second.
 */
const AZURE_TO_AVATAR: readonly (SpeechViseme | readonly [SpeechViseme, SpeechViseme])[] = [
  "viseme_sil", // 0 silence
  "viseme_AX", // 1 æ ə ʌ
  "viseme_aa", // 2 ɑ
  "viseme_O", // 3 ɔ
  "viseme_E", // 4 ɛ ʊ
  "viseme_ER", // 5 ɝ
  "viseme_I", // 6 j i ɪ
  "viseme_U", // 7 w u
  "viseme_OW", // 8 o
  ["viseme_aa", "viseme_U"], // 9 aʊ
  ["viseme_O", "viseme_I"], // 10 ɔɪ
  ["viseme_aa", "viseme_I"], // 11 aɪ
  "viseme_HH", // 12 h (and Dutch g/ch)
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

  const byOffset = new Map<number, (typeof AZURE_TO_AVATAR)[number]>();
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
  const push = (atMs: number, viseme: SpeechViseme) => {
    if (keyframes.at(-1)?.viseme === viseme) return;
    keyframes.push({
      atSeconds: atMs / 1000,
      viseme,
      weight: viseme === "viseme_sil" ? 1 : SPOKEN_WEIGHT,
    });
  };
  const timeline = [...byOffset].sort(([a], [b]) => a - b);
  timeline.forEach(([offsetMs, target], index) => {
    if (typeof target === "string") {
      push(offsetMs, target);
      return;
    }
    const nextMs = timeline[index + 1]?.[0] ?? durationMs;
    push(offsetMs, target[0]);
    push((offsetMs + nextMs) / 2, target[1]);
  });
  keyframes.push({ atSeconds: durationSeconds, viseme: "viseme_sil", weight: 1 });

  if (keyframes.length > MAX_KEYFRAME_COUNT) {
    throw new RangeError(`Clip has more than ${MAX_KEYFRAME_COUNT} visemes.`);
  }
  return Object.freeze({ durationSeconds, keyframes: Object.freeze(keyframes) });
}
