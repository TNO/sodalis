import { describe, expect, it } from "vitest";
import { countWordErrors, selectSamples } from "./stt-benchmark.js";

describe("Dutch STT benchmark", () => {
  it("scores transcript substitutions after case and punctuation normalization", () => {
    expect(countWordErrors("Hoe oud bent u?", "Hoe oud ben ik?")).toEqual({
      errors: 2,
      words: 4,
    });
    expect(countWordErrors("Arm, kleine!", "arm kleine")).toEqual({
      errors: 0,
      words: 2,
    });
  });

  it("selects reproducible readings from distinct speakers with available references", () => {
    const transcripts = [
      "200_1_000002\tDit is een tweede zin die lang genoeg is voor de test",
      "100_1_000001\tEen zin voor een andere stem met voldoende woorden",
      "200_1_000001\tTe kort",
    ].join("\n");
    const segments = [
      "200_1_000001\thttp://example.test\t0\t12",
      "200_1_000002\thttp://example.test\t12\t28",
      "100_1_000001\thttp://example.test\t0\t15",
    ].join("\n");

    expect(selectSamples(transcripts, segments)).toEqual([
      { id: "100_1_000001", speaker: "100", durationSeconds: 15,
        reference: "Een zin voor een andere stem met voldoende woorden" },
      { id: "200_1_000002", speaker: "200", durationSeconds: 16,
        reference: "Dit is een tweede zin die lang genoeg is voor de test" },
    ]);
  });
});
