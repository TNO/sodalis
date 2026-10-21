import { describe, expect, it } from "vitest";
import { AVATAR_FRAMINGS } from "../index.js";
import { framingFieldOfView, framingSpan } from "./framing.js";

// Joint heights measured from the TalkingHead Brunette avatar.
const brunette = {
  top: 1.766,
  bottom: 0,
  eye: 1.634,
  neck: 1.469,
  shoulder: 1.438,
  chest: 1.344,
  spine1: 1.224,
  spine: 1.133,
  hips: 1.037,
  knee: 0.572,
  foot: 0.127,
};

describe("framingSpan", () => {
  it("cuts each framing at its anatomical landmark", () => {
    const span = (name: (typeof AVATAR_FRAMINGS)[number]) =>
      framingSpan(name, brunette);

    expect(span("face").top).toBeLessThan(brunette.top);
    expect(span("face").bottom).toBeGreaterThan(brunette.neck);
    expect(span("head").top).toBeGreaterThanOrEqual(brunette.top);
    expect(span("head").bottom).toBeGreaterThan(brunette.shoulder);
    expect(span("head-shoulders").bottom).toBeLessThan(brunette.shoulder);
    expect(span("head-shoulders").bottom).toBeGreaterThan(brunette.chest);
    expect(span("bust").bottom).toBeLessThan(brunette.chest);
    expect(span("bust").bottom).toBeGreaterThan(brunette.spine1);
    expect(span("half-body").bottom).toBeLessThan(brunette.spine);
    expect(span("half-body").bottom).toBeGreaterThan(brunette.knee);
    expect(span("three-quarter").bottom).toBeLessThan(brunette.knee);
    expect(span("three-quarter").bottom).toBeGreaterThan(brunette.foot);
    expect(span("full-body").bottom).toBeLessThanOrEqual(brunette.bottom);
    for (const name of AVATAR_FRAMINGS) {
      expect(span(name).top).toBeGreaterThan(brunette.eye);
    }
  });

  it("widens monotonically from face to full body", () => {
    const heights = AVATAR_FRAMINGS.map((name) => {
      const { top, bottom } = framingSpan(name, brunette);
      return top - bottom;
    });
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });

  it("ignores bounds far above the head, such as a raised hand", () => {
    const raised = framingSpan("head", { ...brunette, top: 2.3 });
    expect(raised.top).toBeLessThan(1.9);
  });

  it("falls back to body proportions when joints are missing", () => {
    const span = framingSpan("half-body", { top: 1.8, bottom: 0 });
    expect(span.top).toBeGreaterThan(1.75);
    expect(span.bottom).toBeGreaterThan(0.9);
    expect(span.bottom).toBeLessThan(1.15);
  });

  it("rejects unknown framings", () => {
    expect(() => framingFieldOfView("upper-body" as never)).toThrow(
      RangeError,
    );
  });
});
