import type { AvatarViseme } from "@sodalis/avatar";

export interface LipSyncAvatar {
  setViseme(viseme: AvatarViseme, weight: number): void;
}

const SILENCE_THRESHOLD = 0.015;
const MAX_RMS = 0.16;
const MIN_WEIGHT = 0.16;

export class AmplitudeLipSyncAdapter {
  private smoothedRms = 0;
  private lastViseme: AvatarViseme = "viseme_sil";
  private lastWeight = 1;
  private hasWrittenViseme = false;

  constructor(private readonly avatar: LipSyncAvatar) {}

  update(rms: number): void {
    if (!Number.isFinite(rms) || rms < 0) {
      throw new RangeError("Audio amplitude must be a finite non-negative number.");
    }
    const target = Math.min(1, rms);
    this.smoothedRms += (target - this.smoothedRms) * 0.4;
    const isSpeaking = this.smoothedRms >= SILENCE_THRESHOLD;
    const viseme: AvatarViseme = isSpeaking ? "viseme_aa" : "viseme_sil";
    const weight = isSpeaking
      ? Math.min(
          1,
          Math.max(
            MIN_WEIGHT,
            (this.smoothedRms - SILENCE_THRESHOLD) /
              (MAX_RMS - SILENCE_THRESHOLD),
          ),
        )
      : 1;

    if (
      viseme === this.lastViseme &&
      Math.abs(weight - this.lastWeight) < 0.08
    ) {
      return;
    }
    this.avatar.setViseme(viseme, weight);
    this.lastViseme = viseme;
    this.lastWeight = weight;
    this.hasWrittenViseme = true;
  }

  reset(): void {
    this.smoothedRms = 0;
    if (
      this.hasWrittenViseme &&
      this.lastViseme === "viseme_sil" &&
      this.lastWeight === 1
    ) {
      return;
    }
    this.avatar.setViseme("viseme_sil", 1);
    this.lastViseme = "viseme_sil";
    this.lastWeight = 1;
    this.hasWrittenViseme = true;
  }
}
