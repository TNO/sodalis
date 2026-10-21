import type { AvatarBehaviorController } from "@sodalis/avatar";
import {
  createAzureVisemeSequence,
  type AzureVisemeEvent,
} from "@sodalis/avatar/testing/azure";
import { createTextVisemeSequence } from "@sodalis/avatar/testing/text";

/** Seconds per TalkingHead viseme unit for a system voice at rate 1. */
const SECONDS_PER_UNIT_AT_NORMAL_RATE = 0.075;

/**
 * Picks an English system voice that runs on this device. Remote voices are
 * excluded, because they would send the text to a cloud speech service.
 */
export function pickOnDeviceVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const english = voices.filter(
    (voice) => voice.localService && voice.lang.toLowerCase().startsWith("en"),
  );
  return english.find((voice) => voice.default) ?? english[0];
}

export interface StageSpeechRequest {
  text: string;
  rate: number;
  controller: Pick<AvatarBehaviorController, "startMockSpeech">;
  voice?: SpeechSynthesisVoice;
  synth?: Pick<SpeechSynthesis, "cancel" | "speak">;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
}

/**
 * Plays rule-based lip sync for `text`. With an on-device voice it starts when
 * the voice does; timing is estimated, not aligned to the audio.
 */
export function speakOnStage(request: StageSpeechRequest): void {
  const sequence = createTextVisemeSequence(request.text, {
    secondsPerUnit: SECONDS_PER_UNIT_AT_NORMAL_RATE / request.rate,
  });
  const { voice, synth } = request;
  if (!voice || !synth) {
    request.controller.startMockSpeech(sequence);
    return;
  }
  synth.cancel();
  const utterance = (
    request.createUtterance ?? ((text) => new SpeechSynthesisUtterance(text))
  )(request.text);
  utterance.voice = voice;
  utterance.rate = request.rate;
  utterance.onstart = () => request.controller.startMockSpeech(sequence);
  synth.speak(utterance);
}

/** A recorded TTS clip with Azure viseme timing, from `scripts/azure-visemes.py`. */
export interface RecordedClip {
  readonly text: string;
  readonly durationMs: number;
  readonly visemes: readonly AzureVisemeEvent[];
}

export interface RecordedClipIndex {
  readonly voice: string;
  readonly clips: readonly { readonly id: string; readonly text: string }[];
}

export interface RecordedSpeechRequest {
  clip: RecordedClip;
  audio: Pick<HTMLAudioElement, "play" | "addEventListener">;
  controller: Pick<AvatarBehaviorController, "startMockSpeech">;
}

/**
 * Plays a recorded clip and starts its viseme track when the audio starts, so
 * lip sync follows the real audio timing.
 */
export async function playRecordedOnStage(request: RecordedSpeechRequest): Promise<void> {
  const sequence = createAzureVisemeSequence(request.clip.visemes, request.clip.durationMs);
  request.audio.addEventListener(
    "playing",
    () => request.controller.startMockSpeech(sequence),
    { once: true },
  );
  await request.audio.play();
}
