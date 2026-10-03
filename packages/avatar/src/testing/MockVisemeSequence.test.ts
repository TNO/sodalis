import { describe, expect, it } from "vitest";
import {
  createMockVisemeSequence,
  sampleMockVisemeSequence,
} from "./MockVisemeSequence.js";

describe("mock viseme sequences", () => {
  it("creates a repeatable timestamped sequence for a seed", () => {
    const first = createMockVisemeSequence(42, 2);
    const second = createMockVisemeSequence(42, 2);
    const differentSeed = createMockVisemeSequence(43, 2);

    expect(first).toEqual(second);
    expect(first).not.toEqual(differentSeed);
    expect(first.keyframes[0]).toEqual({
      atSeconds: 0,
      viseme: "viseme_sil",
      weight: 1,
    });
    expect(first.keyframes.at(-1)).toEqual({
      atSeconds: 2,
      viseme: "viseme_sil",
      weight: 1,
    });
  });

  it("interpolates between semantic visemes and clamps to the timeline edges", () => {
    const sequence = {
      durationSeconds: 2,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_sil", weight: 1 },
        { atSeconds: 1, viseme: "viseme_aa", weight: 1 },
        { atSeconds: 2, viseme: "viseme_E", weight: 0 },
      ],
    } as const;

    const beforeStart = sampleMockVisemeSequence(sequence, -1);
    const midpoint = sampleMockVisemeSequence(sequence, 0.5);
    const afterEnd = sampleMockVisemeSequence(sequence, 3);

    expect(beforeStart.viseme_sil).toBe(1);
    expect(midpoint.viseme_sil).toBeCloseTo(0.5);
    expect(midpoint.viseme_aa).toBeCloseTo(0.5);
    expect(Object.values(midpoint).reduce((sum, weight) => sum + weight, 0))
      .toBeCloseTo(1);
    expect(afterEnd.viseme_E).toBe(0);
  });
});
