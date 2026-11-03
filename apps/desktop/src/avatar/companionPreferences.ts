export interface CompanionPreferences {
  readonly speechRate: number;
  readonly sentencePauseMs: number;
  readonly shortSentences: boolean;
  readonly subtitles: boolean;
  readonly subtitleSize: number;
  readonly subtitleColor: string;
  readonly subtitleBackground: string;
}

export const DEFAULT_COMPANION_PREFERENCES: CompanionPreferences = {
  speechRate: 1,
  sentencePauseMs: 120,
  shortSentences: false,
  subtitles: true,
  subtitleSize: 20,
  subtitleColor: "#ffffff",
  subtitleBackground: "#20252b",
};

const STORAGE_KEY = "sodalis.companion.preferences";
const COLOR = /^#[0-9a-f]{6}$/i;

function isPreferences(value: unknown): value is CompanionPreferences {
  if (typeof value !== "object" || value === null) return false;
  return (
    "speechRate" in value && isSpeechRate(value.speechRate) &&
    "sentencePauseMs" in value && isSpeechPauseMs(value.sentencePauseMs) &&
    "shortSentences" in value && typeof value.shortSentences === "boolean" &&
    "subtitles" in value && typeof value.subtitles === "boolean" &&
    "subtitleSize" in value && typeof value.subtitleSize === "number" &&
    [16, 20, 24, 28, 32].includes(value.subtitleSize) &&
    "subtitleColor" in value && typeof value.subtitleColor === "string" &&
    COLOR.test(value.subtitleColor) &&
    "subtitleBackground" in value && typeof value.subtitleBackground === "string" &&
    COLOR.test(value.subtitleBackground)
  );
}

export interface CompanionPreferenceStore {
  readonly value: CompanionPreferences;
  update(patch: Partial<CompanionPreferences>): void;
}

export function createCompanionPreferences(options: {
  storage?: Pick<Storage, "getItem" | "setItem">;
  onChange?: () => void;
  onError?: (error: Error) => void;
} = {}): CompanionPreferenceStore {
  const report = (error: unknown) =>
    (options.onError ?? ((failure: Error) => console.error("Companion preferences:", failure)))(
      error instanceof Error ? error : new Error(String(error)),
    );
  let value = DEFAULT_COMPANION_PREFERENCES;
  let storage = options.storage;
  try {
    storage ??= typeof window === "undefined" ? undefined : window.localStorage;
    const stored = storage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (!isPreferences(parsed)) {
        throw new Error("Saved speech/subtitle settings are invalid. Default settings restored.");
      }
      value = parsed;
    }
  } catch (error) {
    report(error);
  }
  return {
    get value() { return value; },
    update(patch) {
      const next = { ...value, ...patch };
      if (!isPreferences(next)) {
        throw new RangeError("Speech/subtitle settings are outside the supported range.");
      }
      value = next;
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (error) {
        report(new Error("Settings apply for this session but could not be saved.", { cause: error }));
      }
      options.onChange?.();
    },
  };
}

export function subtitleContrast(value: Pick<CompanionPreferences, "subtitleColor" | "subtitleBackground">): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const foreground = luminance(value.subtitleColor);
  const background = luminance(value.subtitleBackground);
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
}
import { isSpeechPauseMs, isSpeechRate } from "@sodalis/speech";
