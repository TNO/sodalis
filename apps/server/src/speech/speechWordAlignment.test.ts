import { describe, expect, it } from "vitest";
import { alignSpeechWords } from "./speechWordAlignment.js";

describe("alignSpeechWords", () => {
  it("matches source words by normalized content and ignores extra recognized words", () => {
    expect(
      alignSpeechWords(
        "Hello, brave world!",
        [
          { word: " hello.", start: 0, end: 0.4 },
          { word: "um", start: 0.4, end: 0.5 },
          { word: "WORLD!", start: 0.6, end: 0.9 },
        ],
        1,
      ),
    ).toEqual([
      { word: "Hello", start: 0, end: 0.4 },
      { word: "brave", start: 0.4, end: 0.6 },
      { word: "world", start: 0.6, end: 0.9 },
    ]);
  });

  it("interpolates missing leading and trailing source words deterministically", () => {
    expect(
      alignSpeechWords(
        "one two three four",
        [{ word: "three", start: 0.5, end: 0.8 }],
        1.2,
      ),
    ).toEqual([
      { word: "one", start: 0, end: 0.25 },
      { word: "two", start: 0.25, end: 0.5 },
      { word: "three", start: 0.5, end: 0.8 },
      { word: "four", start: 0.8, end: 1.2 },
    ]);
  });

  it("normalizes punctuation and Unicode case without changing source spelling", () => {
    expect(
      alignSpeechWords("Café, déjà vu.", [
        { word: "CAFÉ", start: 0.1, end: 0.3 },
        { word: "déjà,", start: 0.35, end: 0.6 },
        { word: "VU!", start: 0.65, end: 0.8 },
      ]),
    ).toEqual([
      { word: "Café", start: 0.1, end: 0.3 },
      { word: "déjà", start: 0.35, end: 0.6 },
      { word: "vu", start: 0.65, end: 0.8 },
    ]);
  });

  it("rejects invalid and unordered word timings or an invalid duration", () => {
    expect(() =>
      alignSpeechWords("hello", [{ word: "hello", start: Number.NaN, end: 1 }]),
    ).toThrow("finite");
    expect(() =>
      alignSpeechWords("hello", [{ word: "hello", start: 1, end: 0.5 }]),
    ).toThrow("end");
    expect(() =>
      alignSpeechWords("one two", [
        { word: "one", start: 0.5, end: 0.8 },
        { word: "two", start: 0.1, end: 0.4 },
      ]),
    ).toThrow("ordered");
    expect(() => alignSpeechWords("hello", [], Number.POSITIVE_INFINITY))
      .toThrow("duration");
    expect(() => alignSpeechWords("hello", [], 0)).toThrow("duration");
  });
});
