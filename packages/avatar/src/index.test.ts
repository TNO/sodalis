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
        preferred: "bust",
        cameraDistanceScale: 1.1,
      },
      hiddenNodes: ["Wolf3D_Glasses"],
      lighting: "portrait",
      behavior: {
        blinkScale: 0.9,
        poseScale: 0.4,
        idleFaceScale: 0.3,
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
      lighting: "noir",
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
        { path: "lighting" },
        { path: "framing.preferred" },
        { path: "framing.cameraDistanceScale" },
        { path: "behavior.blinkScale" },
      ],
    });
  });

  it("rejects pose and idle face scales above one", () => {
    const validation = validateAvatarAsset({
      id: "companion",
      name: "Companion",
      modelUrl: "/avatars/companion.glb",
      profile: "sodalis-avatar-0.1",
      behavior: { poseScale: 1.5, idleFaceScale: 2 },
    });

    expect(validation).toMatchObject({
      ok: false,
      issues: [
        { path: "behavior.poseScale" },
        { path: "behavior.idleFaceScale" },
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

  it("accepts spring-bone settings for rigged hair", () => {
    const asset: AvatarAsset = {
      id: "companion",
      name: "Companion",
      modelUrl: "/avatars/companion.glb",
      profile: "sodalis-avatar-0.1",
      dynamicBones: [
        {
          bone: "Hair1_2",
          type: "link",
          stiffness: 20,
          damping: [2, 2, 2, 4],
          external: 0.6,
          limits: [null, null, [null, 0.01], null],
          excludes: [
            { bone: "Head", radius: 0.11, deltaLocal: [0, 0.05, 0.02] },
          ],
        },
        { bone: "Hair1_3", type: "full", stiffness: 40, damping: 3, pivot: true },
      ],
    };

    expect(validateAvatarAsset(asset)).toEqual({ ok: true, asset });
  });

  it("rejects invalid or duplicate spring-bone settings by path", () => {
    const validation = validateAvatarAsset({
      id: "companion",
      name: "Companion",
      modelUrl: "/avatars/companion.glb",
      profile: "sodalis-avatar-0.1",
      dynamicBones: [
        { bone: "Hair1_2", type: "wobble", stiffness: -1, damping: [1, 2] },
        { bone: "Hair1_2", type: "point", stiffness: 1, damping: 1, pivot: true },
        {
          bone: "Hair1_3",
          type: "link",
          stiffness: 1,
          damping: 1,
          external: 2,
          excludes: [{ bone: "Head" }],
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      issues: [
        { path: "dynamicBones.0.type" },
        { path: "dynamicBones.0.stiffness" },
        { path: "dynamicBones.0.damping" },
        { path: "dynamicBones.1.bone" },
        { path: "dynamicBones.1.pivot" },
        { path: "dynamicBones.2.external" },
        { path: "dynamicBones.2.excludes.0" },
      ],
    });
  });
});
