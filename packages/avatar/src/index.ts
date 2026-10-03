export const AVATAR_STATES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "interrupted",
] as const;

export type AvatarState = (typeof AVATAR_STATES)[number];

export const AVATAR_ARKIT_SHAPES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "tongueOut",
] as const;

export const AVATAR_REQUIRED_BONES = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
] as const;

export const AVATAR_MAX_TRIANGLES = 100_000;
export const AVATAR_MAX_DRAW_CALLS = 48;
export const AVATAR_MAX_TEXTURE_DIMENSION = 2048;

export const AVATAR_VISEMES = [
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
] as const;

export type AvatarViseme = (typeof AVATAR_VISEMES)[number];

export const AVATAR_GESTURES = [
  "nod",
  "shake-head",
  "acknowledge",
  "none",
] as const;

export type AvatarGesture = (typeof AVATAR_GESTURES)[number];

export const AVATAR_EXPRESSIONS = [
  "neutral",
  "warm",
  "happy",
  "concerned",
  "sad",
  "surprised",
  "reassuring",
] as const;

export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];

export interface MockVisemeKeyframe {
  atSeconds: number;
  viseme: AvatarViseme;
  weight: number;
}

export interface MockVisemeSequence {
  durationSeconds: number;
  keyframes: readonly MockVisemeKeyframe[];
}

export interface AvatarAffect {
  valence: number;
  arousal: number;
  expression?: AvatarExpression;
  intensity: number;
}

export const AVATAR_PROFILE_ID = "sodalis-avatar-0.1";

export const AVATAR_FRAMINGS = ["head", "upper-body", "half-body"] as const;
export type AvatarFramingName = (typeof AVATAR_FRAMINGS)[number];

export interface AvatarAsset {
  id: string;
  name: string;
  modelUrl: string;
  profile: typeof AVATAR_PROFILE_ID;
  framing?: {
    preferred: AvatarFramingName;
    cameraTargetYOffset?: number;
    cameraDistanceScale?: number;
  };
  behavior?: {
    blinkScale?: number;
    expressionScale?: number;
    headMotionScale?: number;
  };
}

export interface AvatarAssetIssue {
  path: string;
  message: string;
}

export type AvatarAssetValidation =
  | { ok: true; asset: AvatarAsset }
  | { ok: false; issues: AvatarAssetIssue[] };

export type AvatarLookTarget =
  | { type: "user" }
  | { type: "screen"; x: number; y: number }
  | { type: "ui-element"; id: string }
  | { type: "world"; x: number; y: number; z: number };

export {
  createAttentionTargetRegistry,
  createAvatarUiTargetRegistry,
  type AttentionImportance,
  type AttentionTarget,
  type AttentionTargetRegistration,
  type AttentionTargetRegistry,
  type AvatarUiTargetBounds,
  type AvatarUiTargetRegistry,
} from "./targets/AttentionTargetRegistry.js";

export type AvatarQuality = "low" | "medium" | "high" | "auto";

export interface AvatarController {
  load(asset: AvatarAsset, signal?: AbortSignal): Promise<void>;
  unload(): Promise<void>;
  setState(state: AvatarState): void;
  setAffect(affect: AvatarAffect): void;
  lookAt(target: AvatarLookTarget): void;
  resetGaze(): void;
  playGesture(gesture: AvatarGesture, signal?: AbortSignal): Promise<void>;
  setViseme(viseme: AvatarViseme, weight: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface AvatarBehaviorController extends AvatarController {
  setReducedMotion(reduced: boolean): void;
  startMockSpeech(sequence?: MockVisemeSequence): void;
  interrupt(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAvatarAffect(affect: AvatarAffect): AvatarAffect {
  const { valence, arousal, intensity, expression } = affect;
  if (![valence, arousal, intensity].every(Number.isFinite)) {
    throw new RangeError("Avatar affect values must be finite numbers.");
  }
  if (expression !== undefined && !AVATAR_EXPRESSIONS.includes(expression)) {
    throw new RangeError(`Unknown avatar expression "${expression}".`);
  }

  return {
    valence: clamp(valence, -1, 1),
    arousal: clamp(arousal, 0, 1),
    ...(expression ? { expression } : {}),
    intensity: clamp(intensity, 0, 1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.some((item) => item === value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateFraming(
  value: unknown,
  issues: AvatarAssetIssue[],
): AvatarAsset["framing"] {
  if (!isRecord(value)) {
    issues.push({ path: "framing", message: "Must be an object." });
    return undefined;
  }

  const preferred = value.preferred;
  if (!hasValue(AVATAR_FRAMINGS, preferred)) {
    issues.push({
      path: "framing.preferred",
      message: `Must be one of: ${AVATAR_FRAMINGS.join(", ")}.`,
    });
  }

  const cameraTargetYOffset = value.cameraTargetYOffset;
  if (
    cameraTargetYOffset !== undefined &&
    !isFiniteNumber(cameraTargetYOffset)
  ) {
    issues.push({
      path: "framing.cameraTargetYOffset",
      message: "Must be a finite number.",
    });
  }

  const cameraDistanceScale = value.cameraDistanceScale;
  if (
    cameraDistanceScale !== undefined &&
    (!isFiniteNumber(cameraDistanceScale) || cameraDistanceScale <= 0)
  ) {
    issues.push({
      path: "framing.cameraDistanceScale",
      message: "Must be a finite number greater than zero.",
    });
  }

  if (!hasValue(AVATAR_FRAMINGS, preferred)) return undefined;
  return {
    preferred,
    ...(isFiniteNumber(cameraTargetYOffset) ? { cameraTargetYOffset } : {}),
    ...(isFiniteNumber(cameraDistanceScale) ? { cameraDistanceScale } : {}),
  };
}

function validateBehavior(
  value: unknown,
  issues: AvatarAssetIssue[],
): AvatarAsset["behavior"] {
  if (!isRecord(value)) {
    issues.push({ path: "behavior", message: "Must be an object." });
    return undefined;
  }

  const scales = {
    blinkScale: value.blinkScale,
    expressionScale: value.expressionScale,
    headMotionScale: value.headMotionScale,
  };
  for (const [path, scale] of Object.entries(scales)) {
    if (scale !== undefined && (!isFiniteNumber(scale) || scale < 0)) {
      issues.push({
        path: `behavior.${path}`,
        message: "Must be a finite number greater than or equal to zero.",
      });
    }
  }

  return {
    ...(isFiniteNumber(scales.blinkScale)
      ? { blinkScale: scales.blinkScale }
      : {}),
    ...(isFiniteNumber(scales.expressionScale)
      ? { expressionScale: scales.expressionScale }
      : {}),
    ...(isFiniteNumber(scales.headMotionScale)
      ? { headMotionScale: scales.headMotionScale }
      : {}),
  };
}

export function validateAvatarAsset(value: unknown): AvatarAssetValidation {
  const issues: AvatarAssetIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "", message: "Must be an object." }],
    };
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const modelUrl =
    typeof value.modelUrl === "string" ? value.modelUrl.trim() : "";

  if (!id) issues.push({ path: "id", message: "Must be a non-empty string." });
  if (!name)
    issues.push({ path: "name", message: "Must be a non-empty string." });
  if (!modelUrl)
    issues.push({
      path: "modelUrl",
      message: "Must be a non-empty string.",
    });
  if (value.profile !== AVATAR_PROFILE_ID) {
    issues.push({
      path: "profile",
      message: `Must be "${AVATAR_PROFILE_ID}".`,
    });
  }

  const framing =
    value.framing === undefined
      ? undefined
      : validateFraming(value.framing, issues);
  const behavior =
    value.behavior === undefined
      ? undefined
      : validateBehavior(value.behavior, issues);

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    asset: {
      id,
      name,
      modelUrl,
      profile: AVATAR_PROFILE_ID,
      ...(framing ? { framing } : {}),
      ...(behavior ? { behavior } : {}),
    },
  };
}
