import { describe, expect, it } from "vitest";
import {
  extractAssistantUtteranceTextPrefix,
  normalizeAssistantUtterance,
  parseAssistantUtterance,
} from "./AssistantUtterance.js";

describe("AssistantUtterance", () => {
  it("accepts a valid semantic utterance", () => {
    expect(
      normalizeAssistantUtterance({
        text: "I found the reply button.",
        affect: {
          expression: "reassuring",
          valence: 0.4,
          arousal: 0.25,
          intensity: 0.3,
        },
        gesture: "acknowledge",
        interruptible: false,
      }),
    ).toEqual({
      text: "I found the reply button.",
      affect: {
        expression: "reassuring",
        valence: 0.4,
        arousal: 0.25,
        intensity: 0.3,
      },
      gesture: "acknowledge",
      interruptible: false,
    });
  });

  it("uses warm neutral behavior for malformed or missing semantic fields", () => {
    expect(
      normalizeAssistantUtterance({
        text: "Here is the answer.",
        affect: {
          expression: "blendshape-mouth-smile",
          valence: "high",
          arousal: Number.NaN,
          intensity: -2,
        },
        gesture: "wave",
        interruptible: "sometimes",
      }),
    ).toEqual({
      text: "Here is the answer.",
      affect: {
        expression: "warm",
        valence: 0.2,
        arousal: 0.2,
        intensity: 0,
      },
      interruptible: true,
    });
    expect(normalizeAssistantUtterance({ text: "Hello." })).toMatchObject({
      affect: { expression: "warm", valence: 0.2 },
      interruptible: true,
    });
    expect(normalizeAssistantUtterance({ affect: {} }).text).toBe(
      "I'm sorry, I couldn't prepare a response.",
    );
  });

  it("clamps extreme affect values to protocol bounds", () => {
    expect(
      normalizeAssistantUtterance({
        text: "A response.",
        affect: {
          expression: "happy",
          valence: 42,
          arousal: -8,
          intensity: 12,
        },
      }).affect,
    ).toEqual({
      expression: "happy",
      valence: 1,
      arousal: 0,
      intensity: 1,
    });
  });

  it("parses JSON while providing safe defaults for malformed structured output", () => {
    expect(
      parseAssistantUtterance(
        '{"text":"Hello there.","affect":{"expression":"happy","valence":0.5,"arousal":0.3,"intensity":0.4},"gesture":"nod","interruptible":true}',
      ),
    ).toMatchObject({
      text: "Hello there.",
      affect: { expression: "happy" },
      gesture: "nod",
    });
    expect(parseAssistantUtterance('{"text":"Safe fallback",')).toMatchObject({
      text: "Safe fallback",
      affect: { expression: "warm" },
      interruptible: true,
    });
    expect(parseAssistantUtterance('["not", "an", "utterance"]')).toMatchObject({
      text: "I'm sorry, I couldn't prepare a response.",
      affect: { expression: "warm" },
    });
    expect(parseAssistantUtterance("A legacy plain-text answer.")).toMatchObject({
      text: "A legacy plain-text answer.",
      affect: { expression: "warm" },
    });
  });

  it("retains only a well-formed semantic action request", () => {
    expect(
      parseAssistantUtterance(
        '{"text":"Find this message.","action":{"id":"mail.search-messages","arguments":{"query":"invoice"}}}',
      ).action,
    ).toEqual({
      id: "mail.search-messages",
      arguments: { query: "invoice" },
    });
    expect(
      parseAssistantUtterance(
        '{"text":"Try this.","action":{"id":"mail.send","arguments":{}}}',
      ).action,
    ).toEqual({ id: "mail.send", arguments: {} });
    expect(
      parseAssistantUtterance(
        '{"text":"No action.","action":{"id":"not trimmed ","arguments":{}}}',
      ).action,
    ).toBeUndefined();
  });

  it("extracts decoded partial text for live captions without exposing JSON", () => {
    expect(
      extractAssistantUtteranceTextPrefix(
        '{"affect":{"expression":"warm"},"text":"Hello \\"there',
      ),
    ).toBe('Hello "there');
  });
});
