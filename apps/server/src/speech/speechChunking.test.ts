import { describe, expect, it } from "vitest";
import {
  clampSpeechChunkPauseMs,
  clampSpeechChunkSize,
  splitSpeechText,
} from "@sodalis/speech";

describe("speech chunking", () => {
  it("keeps closing quotes with their sentence and prefers sentence boundaries", () => {
    expect(
      splitSpeechText(
        "This is the opening sentence. “The quoted sentence ends here!” A final thought deserves its own complete chunk.",
        80,
      ),
    ).toEqual([
      "This is the opening sentence. “The quoted sentence ends here!”",
      "A final thought deserves its own complete chunk.",
    ]);
  });

  it("preserves meaningful newlines when text fits in one chunk", () => {
    expect(splitSpeechText("First paragraph.\n\nSecond paragraph.", 80)).toEqual([
      "First paragraph.\n\nSecond paragraph.",
    ]);
  });

  it("splits long sentences at clauses and then whitespace without dropping text", () => {
    const text =
      "This first clause contains enough words to approach the limit, and this second clause pushes the whole sentence beyond the configured maximum.";
    const chunks = splitSpeechText(text, 80);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("clamps chunk-size and pause settings", () => {
    expect(clampSpeechChunkSize(1)).toBe(80);
    expect(clampSpeechChunkSize(240)).toBe(240);
    expect(clampSpeechChunkSize(5000)).toBe(1000);
    expect(clampSpeechChunkPauseMs(-10)).toBe(0);
    expect(clampSpeechChunkPauseMs(150)).toBe(150);
    expect(clampSpeechChunkPauseMs(9000)).toBe(1000);
  });
});
