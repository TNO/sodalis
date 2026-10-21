import { describe, expect, it } from "vitest";
import { sampleMockVisemeSequence } from "./MockVisemeSequence.js";
import { createAzureVisemeSequence } from "./AzureVisemeSequence.js";

describe("Azure viseme sequence", () => {
  it("turns timed Azure viseme ids into a playable avatar sequence", () => {
    const sequence = createAzureVisemeSequence(
      [
        { id: 0, offsetMs: 50 },
        { id: 21, offsetMs: 100 },
        { id: 2, offsetMs: 180 },
        { id: 18, offsetMs: 260 },
        { id: 0, offsetMs: 400 },
      ],
      500,
    );

    expect(sequence.durationSeconds).toBe(0.5);
    expect(sequence.keyframes.map((frame) => [frame.atSeconds, frame.viseme])).toEqual([
      [0, "viseme_sil"],
      [0.1, "viseme_PP"],
      [0.18, "viseme_aa"],
      [0.26, "viseme_FF"],
      [0.4, "viseme_sil"],
      [0.5, "viseme_sil"],
    ]);
    expect(() => sampleMockVisemeSequence(sequence, 0.2)).not.toThrow();
  });

  it("keeps the last of events sharing an offset and drops events past the end", () => {
    const sequence = createAzureVisemeSequence(
      [
        { id: 19, offsetMs: 100 },
        { id: 20, offsetMs: 100 },
        { id: 15, offsetMs: 900 },
      ],
      500,
    );

    expect(sequence.keyframes.map((frame) => frame.viseme)).toEqual([
      "viseme_sil",
      "viseme_kk",
      "viseme_sil",
    ]);
  });

  it("rejects unknown viseme ids and empty audio", () => {
    expect(() => createAzureVisemeSequence([{ id: 22, offsetMs: 10 }], 100)).toThrow(
      RangeError,
    );
    expect(() => createAzureVisemeSequence([], 0)).toThrow(RangeError);
  });
});
