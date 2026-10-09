import { describe, expect, it } from "vitest";
import { createEnergyVoiceActivityDetector } from "./voiceActivity.js";

function frame(amplitude: number, length = 16): Float32Array {
  return Float32Array.from({ length }, () => amplitude);
}

describe("energy voice activity detector", () => {
  it("emits speech start and end after the configured frame counts", () => {
    const detector = createEnergyVoiceActivityDetector({
      thresholdRms: 0.1,
      startFrames: 2,
      endFrames: 2,
    });

    expect(detector.process(frame(0.01), 0)).toEqual([]);
    expect(detector.process(frame(0.2), 20)).toEqual([]);
    expect(detector.process(frame(0.2), 40)).toEqual([
      { type: "speech-start", timestampMs: 40 },
    ]);
    expect(detector.process(frame(0.01), 60)).toEqual([]);
    expect(detector.process(frame(0.01), 80)).toEqual([
      { type: "speech-end", timestampMs: 80 },
    ]);
  });

  it("resets pending activity and validates detector configuration", () => {
    const detector = createEnergyVoiceActivityDetector({
      thresholdRms: 0.1,
      startFrames: 2,
      endFrames: 2,
    });
    detector.process(frame(0.2), 0);
    detector.reset();

    expect(detector.process(frame(0.2), 20)).toEqual([]);
    expect(() =>
      createEnergyVoiceActivityDetector({ thresholdRms: 0, startFrames: 1 }),
    ).toThrow("VAD thresholdRms must be a finite number greater than zero.");
  });

  it("uses a hangover long enough to survive a natural mid-sentence pause", () => {
    const detector = createEnergyVoiceActivityDetector();

    expect(detector.process(frame(0.2), 0)).toEqual([]);
    expect(detector.process(frame(0.2), 20)).toEqual([
      { type: "speech-start", timestampMs: 20 },
    ]);
    // A 400ms pause between words must not end the segment.
    for (let t = 40; t <= 420; t += 20) {
      expect(detector.process(frame(0), t)).toEqual([]);
    }
    expect(detector.process(frame(0.2), 440)).toEqual([]);
  });
});
