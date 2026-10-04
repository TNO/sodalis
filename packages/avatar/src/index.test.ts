import { describe, expect, it } from "vitest";
import {
  AVATAR_GESTURES,
  AVATAR_EXPRESSIONS,
  AVATAR_ARKIT_SHAPES,
  AVATAR_STATES,
  AVATAR_VISEMES,
  normalizeAvatarAffect,
  validateAvatarAsset,
} from "./index.js";
import type { AvatarAffect, AvatarAsset } from "./index.js";

describe("public avatar contract", () => {
  it("exports the five states defined by the Phase 1 spec", () => {
    expect(AVATAR_STATES).toEqual([
      "idle",
      "listening",
      "thinking",
      "speaking",
      "interrupted",
    ]);
  });

  it("exports the 15 Oculus visemes defined by the Phase 1 spec", () => {
    expect(AVATAR_VISEMES).toEqual([
      "viseme_sil",
      "viseme_PP",
      "viseme_FF",
      "viseme_TH",
      "viseme_DD",
      "viseme_kk",
      "viseme_CH",
      "viseme_SS",
      "viseme_nn",
      "viseme_RR",
      "viseme_aa",
      "viseme_E",
      "viseme_I",
      "viseme_O",
      "viseme_U",
    ]);
  });

  it("exports the 52 ARKit face units required by the avatar profile", () => {
    expect(AVATAR_ARKIT_SHAPES).toHaveLength(52);
    expect(AVATAR_ARKIT_SHAPES).toContain("browDownLeft");
    expect(AVATAR_ARKIT_SHAPES).toContain("eyeBlinkRight");
    expect(AVATAR_ARKIT_SHAPES).toContain("jawOpen");
    expect(AVATAR_ARKIT_SHAPES).toContain("tongueOut");
  });

  it("exports gestures by Sodalis semantics rather than animation names", () => {
    expect(AVATAR_GESTURES).toEqual([
      "nod",
      "shake-head",
      "acknowledge",
      "none",
    ]);
  });

  it("exports the bounded affect expression vocabulary", () => {
    expect(AVATAR_EXPRESSIONS).toEqual([
      "neutral",
      "warm",
      "happy",
      "concerned",
      "sad",
      "surprised",
      "reassuring",
    ]);
  });

  it("clamps affect channels to the ranges in the public contract", () => {
    const affect: AvatarAffect = {
      valence: -1.4,
      arousal: 1.2,
      intensity: -0.2,
    };

    expect(normalizeAvatarAffect(affect)).toEqual({
      valence: -1,
      arousal: 1,
      intensity: 0,
    });
  });

  it("rejects affect values that are not finite numbers", () => {
    expect(() =>
      normalizeAvatarAffect({
        valence: Number.NaN,
        arousal: 0,
        intensity: 0,
      }),
    ).toThrow("Avatar affect values must be finite numbers.");
  });

  it("accepts valid versioned avatar metadata", () => {
    const asset: AvatarAsset = {
      id: "companion",
      name: "Companion",
      modelUrl: "/avatars/companion.glb",
      profile: "sodalis-avatar-0.1",
      framing: {
        preferred: "upper-body",
        cameraDistanceScale: 1.1,
      },
      hiddenNodes: ["Wolf3D_Glasses"],
      behavior: {
        blinkScale: 0.9,
      },
    };

    expect(validateAvatarAsset(asset)).toEqual({ ok: true, asset });
  });

  it("reports every invalid metadata field by path", () => {
    const validation = validateAvatarAsset({
      id: " ",
      name: "",
      modelUrl: " ",
      profile: "unknown",
      framing: {
        preferred: "full",
        cameraDistanceScale: 0,
      },
      behavior: {
        blinkScale: -1,
      },
    });

    expect(validation).toMatchObject({
      ok: false,
      issues: [
        { path: "id" },
        { path: "name" },
        { path: "modelUrl" },
        { path: "profile" },
        { path: "framing.preferred" },
        { path: "framing.cameraDistanceScale" },
        { path: "behavior.blinkScale" },
      ],
    });
  });

  it("rejects empty or duplicate hidden model node names", () => {
    const validation = validateAvatarAsset({
      id: "companion",
      name: "Companion",
      modelUrl: "/avatars/companion.glb",
      profile: "sodalis-avatar-0.1",
      hiddenNodes: [" ", "Wolf3D_Glasses", "Wolf3D_Glasses"],
    });

    expect(validation).toMatchObject({
      ok: false,
      issues: [
        { path: "hiddenNodes.0" },
        { path: "hiddenNodes.2" },
      ],
    });
  });
});
