import { describe, expect, it } from "vitest";
import {
  cancellationText, cancellationVerdict, latencySummary, liveSentences, pcmProblem,
} from "./tts-live-check.js";

const PCM = "audio/pcm;rate=22050;bits=16;channels=1;endianness=little";

describe("live Sodalis TTS check", () => {
  it("accepts only non-empty, whole 16-bit samples of Sodalis PCM", () => {
    expect(pcmProblem(PCM, 44_100)).toBeNull();
    expect(pcmProblem("audio/wav", 44_100)).toMatch(/content type/);
    expect(pcmProblem(null, 44_100)).toMatch(/content type/);
    expect(pcmProblem(PCM, 0)).toMatch(/no audio/);
    expect(pcmProblem(PCM, 44_101)).toMatch(/incomplete/);
  });

  it("summarizes time to first audio separately from total synthesis time", () => {
    expect(latencySummary([
      { firstChunkMs: 300, totalMs: 900 },
      { firstChunkMs: 100, totalMs: 500 },
      { firstChunkMs: 200, totalMs: 1_200 },
      { firstChunkMs: 800, totalMs: 1_000 },
    ])).toEqual({
      count: 4,
      medianFirstChunkMs: 250,
      maxFirstChunkMs: 800,
      medianTotalMs: 950,
    });
    expect(latencySummary([])).toEqual({
      count: 0, medianFirstChunkMs: null, maxFirstChunkMs: null, medianTotalMs: null,
    });
  });

  it("times a short, a typical, and the longest corpus reply", () => {
    expect(liveSentences(["Twee woorden.", "Ja.", "Een iets langere zin.", "Dit is de allerlangste zin hier.",
      "Vier woorden zijn hier."])).toEqual([
      { label: "short", text: "Ja." },
      { label: "medium", text: "Een iets langere zin." },
      { label: "long", text: "Dit is de allerlangste zin hier." },
    ]);
  });

  it("cancels a reply long enough to still be synthesizing, within the speech API's text limit", () => {
    const text = cancellationText(["Eerste zin.", "Tweede zin.", "Derde zin."], 20);
    expect(text).toBe("Eerste zin. Tweede zin.");
    const corpus = Array.from({ length: 50 }, (_, index) => `Dit is voorbeeldzin nummer ${index + 1}.`);
    expect(cancellationText(corpus).length).toBeGreaterThanOrEqual(1_000);
    expect(cancellationText(corpus).length).toBeLessThanOrEqual(5_000);
  });

  describe("cancellation verdict", () => {
    const passing = {
      capacity: 2,
      cancelAfterFirstAudio: true,
      fullReplyMs: 4_000,
      cancellations: [
        { abortAtMs: 300, audioBeforeAbort: true },
        { abortAtMs: 280, audioBeforeAbort: true },
        { abortAtMs: 350, audioBeforeAbort: true },
      ],
      recovery: { status: 200, pcmProblem: null, waitedMs: 150 },
      healthy: true,
      maxRecoveryMs: 2_000,
    };

    it("passes when more streams than the server's TTS capacity were cancelled mid-audio and a new one still plays", () => {
      expect(cancellationVerdict(passing)).toEqual({ pass: true, problems: [] });
    });

    it("fails when cancelled synthesis keeps holding capacity", () => {
      const verdict = cancellationVerdict({
        ...passing, recovery: { status: 503, pcmProblem: null, waitedMs: 2_000 },
      });
      expect(verdict.pass).toBe(false);
      expect(verdict.problems.join()).toMatch(/HTTP 503/);
    });

    it("fails when recovery is too slow, the server is unhealthy, or audio never started", () => {
      expect(cancellationVerdict({
        ...passing, recovery: { status: 200, pcmProblem: null, waitedMs: 5_000 },
      }).problems.join()).toMatch(/5000 ms/);
      expect(cancellationVerdict({ ...passing, healthy: false }).problems.join()).toMatch(/health/);
      expect(cancellationVerdict({
        ...passing,
        cancellations: [...passing.cancellations.slice(1), { abortAtMs: 300, audioBeforeAbort: false }],
      }).problems.join()).toMatch(/request 3/);
    });

    it("does not count a cancellation that came after synthesis had probably finished", () => {
      const verdict = cancellationVerdict({ ...passing, fullReplyMs: 400 });
      expect(verdict.pass).toBe(false);
      expect(verdict.problems.join()).toMatch(/400 ms/);
    });

    it("accepts cancellation before first audio for providers that only stream after synthesizing", () => {
      expect(cancellationVerdict({
        ...passing,
        cancelAfterFirstAudio: false,
        cancellations: passing.cancellations.map((cancellation) => ({ ...cancellation, audioBeforeAbort: false })),
      })).toEqual({ pass: true, problems: [] });
      expect(cancellationVerdict({
        ...passing,
        cancelAfterFirstAudio: false,
        cancellations: [...passing.cancellations.slice(1),
          { abortAtMs: 300, audioBeforeAbort: false, error: "HTTP 503 at TTS capacity" }],
      }).problems.join()).toMatch(/request 3.*503/);
    });

    it("does not claim capacity is released when it was never exceeded", () => {
      expect(cancellationVerdict({
        ...passing, cancellations: passing.cancellations.slice(0, 2),
      }).problems.join()).toMatch(/more than 2/);
    });
  });
});
