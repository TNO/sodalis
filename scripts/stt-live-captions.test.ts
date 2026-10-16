import { describe, expect, it } from "vitest";
import { countCaptionRewrites, splitIntoChunks } from "./stt-live-captions.js";

describe("live caption benchmark", () => {
  it("counts caption updates that change earlier words, not a growing last word", () => {
    expect(countCaptionRewrites([
      "Hoe",
      "Hoe ou",
      "Hoe oud",
      "Hoe oud bent u",
      "Hoe oud ben jij",
      "Hoe oud ben jij?",
      "Wie oud ben jij",
    ])).toEqual({ updates: 7, rewrites: 2 });
  });

  it("splits a recording into equal real-time chunks without losing bytes", () => {
    const audio = Uint8Array.from({ length: 10 }, (_, index) => index);
    const chunks = splitIntoChunks(audio, 3);
    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([4, 4, 2]);
    expect(Uint8Array.from(chunks.flatMap((chunk) => [...chunk]))).toEqual(audio);
  });
});
