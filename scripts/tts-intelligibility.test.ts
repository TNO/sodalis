import { describe, expect, it } from "vitest";
import {
  localOrigin,
  pendingClips,
  scoreClip,
  summarize,
} from "./tts-intelligibility.js";

describe("Dutch TTS intelligibility scoring", () => {
  it("scores a Parakeet transcript against the sentence that was synthesized", () => {
    expect(scoreClip("Goedemorgen! Waarmee kan ik u helpen?",
      "goedemorgen waarmee kan ik je helpen")).toEqual({
      reference: "Goedemorgen! Waarmee kan ik u helpen?",
      transcript: "goedemorgen waarmee kan ik je helpen",
      errors: 1,
      words: 6,
    });
  });

  it("resumes only clips that are unscored or whose sentence changed", () => {
    const metrics = { results: {
      "02": { text: "Twee" }, "01": { text: "Een" }, "03": { text: "Drie nieuw" },
    } };
    const existing = { results: {
      "01": scoreClip("Een", "een"),
      "03": scoreClip("Drie", "drie"),
    } };
    expect(pendingClips(metrics, existing)).toEqual(["02", "03"]);
  });

  it("reports corpus word error rate weighted by reference words", () => {
    expect(summarize({ results: {
      "01": { reference: "", transcript: "", errors: 1, words: 4 },
      "02": { reference: "", transcript: "", errors: 0, words: 6 },
    } })).toEqual({ clips: 2, errors: 1, words: 10, wordErrorRate: 0.1 });
    expect(summarize({ results: {} }).wordErrorRate).toBeNull();
  });

  it("only sends generated audio to a local Sodalis origin", () => {
    expect(localOrigin("http://127.0.0.1:4186/")).toBe("http://127.0.0.1:4186");
    expect(() => localOrigin("https://example.com/")).toThrow(/local HTTP origin/);
    expect(() => localOrigin("http://user:pw@localhost:4176/")).toThrow(/local HTTP origin/);
  });
});
