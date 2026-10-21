import { describe, expect, it } from "vitest";
import { AVATAR_VISEMES } from "../index.js";
import { sampleMockVisemeSequence } from "./MockVisemeSequence.js";
import { createTextVisemeSequence } from "./TextVisemeSequence.js";

describe("text viseme sequence", () => {
  it("turns English text into a timed, playable viseme sequence", () => {
    const sequence = createTextVisemeSequence("Hello, I am Sofia.", {
      secondsPerUnit: 0.1,
    });

    expect(sequence.keyframes[0]).toEqual({
      atSeconds: 0,
      viseme: "viseme_sil",
      weight: 1,
    });
    expect(sequence.keyframes.at(-1)).toMatchObject({
      atSeconds: sequence.durationSeconds,
      viseme: "viseme_sil",
    });
    const spoken = sequence.keyframes.slice(1, -1);
    expect(spoken.map((frame) => frame.viseme)).toContain("viseme_PP");
    expect(spoken.every((frame) => AVATAR_VISEMES.includes(frame.viseme))).toBe(
      true,
    );
    expect(() => sampleMockVisemeSequence(sequence, 0.5)).not.toThrow();
  });

  it("scales with speaking speed", () => {
    const slow = createTextVisemeSequence("How are you today?", {
      secondsPerUnit: 0.1,
    });
    const fast = createTextVisemeSequence("How are you today?", {
      secondsPerUnit: 0.05,
    });

    expect(fast.durationSeconds).toBeCloseTo(slow.durationSeconds / 2, 5);
  });

  it("rejects text without speakable words", () => {
    expect(() => createTextVisemeSequence(" ... ")).toThrow(RangeError);
  });
});
