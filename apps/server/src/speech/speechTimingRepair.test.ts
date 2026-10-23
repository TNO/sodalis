import { describe, expect, it } from "vitest";
import {
  detectSpeechOnset,
  parseSilenceDetectOutput,
  shiftWordTimestamps,
} from "./speechTimingRepair.js";
import { trimUnsupportedTranscriptTail } from "./speechWordAlignment.js";

describe("speech timing repair", () => {
  it("distinguishes audio with no silence, leading silence, and all silence", () => {
    expect(parseSilenceDetectOutput("")).toEqual({
      status: "no-silence",
      onsetSeconds: 0,
    });
    expect(
      parseSilenceDetectOutput(
        "silence_start: 0.000000\nsilence_end: 0.240000 | silence_duration: 0.240000",
      ),
    ).toEqual({ status: "leading-silence", onsetSeconds: 0.24 });
    expect(parseSilenceDetectOutput("silence_start: 0.000000")).toEqual({
      status: "all-silence",
    });
    expect(
      parseSilenceDetectOutput(
        "silence_start: 0.500000\nsilence_end: 0.700000 | silence_duration: 0.200000",
      ),
    ).toEqual({ status: "no-silence", onsetSeconds: 0 });
  });

  it("rejects invalid detection output and surfaces FFmpeg failures", async () => {
    expect(() => parseSilenceDetectOutput("silence_start: NaN"))
      .toThrow("could not parse");
    await expect(
      detectSpeechOnset(
        new Uint8Array([1]),
        "audio/wav",
        new AbortController().signal,
        async () => {
          throw new Error("decoder failed");
        },
      ),
    ).rejects.toThrow("FFmpeg silence detection failed: decoder failed");
  });

  it("shifts and clamps timestamps to the detected speech onset", () => {
    expect(
      shiftWordTimestamps(
        [
          { word: "noise", start: 0.1, end: 0.2 },
          { word: "hello", start: 0.3, end: 0.6 },
        ],
        0.25,
      ),
    ).toEqual([
      { word: "noise", start: 0, end: 0 },
      { word: "hello", start: 0.05, end: 0.35 },
    ]);
    expect(() =>
      shiftWordTimestamps([{ word: "bad", start: 0, end: 1 }], Number.NaN),
    ).toThrow("onset");
  });

  it("trims only unsupported transcript tail words and preserves interior differences", () => {
    expect(
      trimUnsupportedTranscriptTail(
        "Hello, brave world.",
        "Hello brave world. hallucinated ending.",
      ),
    ).toBe("Hello brave world.");
    expect(
      trimUnsupportedTranscriptTail(
        "one two",
        "one extra two!! trailing text",
      ),
    ).toBe("one extra two!!");
    expect(trimUnsupportedTranscriptTail("expected", "unrelated words"))
      .toBe("unrelated words");
  });
});
