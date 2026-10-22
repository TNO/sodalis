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

/**
 * Optional finer mouth shapes for phoneme groups the 15 Oculus visemes merge
 * (Azure viseme ids 1, 8, 5 and 12). Avatars without them fall back to the
 * core viseme in `AVATAR_DETAIL_VISEME_FALLBACK`.
 */
export const AVATAR_DETAIL_VISEMES = [
  "viseme_AX", // æ ə ʌ: relaxed, half-open
  "viseme_OW", // o: close, rounded
  "viseme_ER", // ɝ: r-coloured vowel
  "viseme_HH", // h and Dutch g/ch: open, breathy
] as const;

export type AvatarDetailViseme = (typeof AVATAR_DETAIL_VISEMES)[number];

export const AVATAR_DETAIL_VISEME_FALLBACK: Readonly<
  Record<AvatarDetailViseme, AvatarViseme>
> = {
  viseme_AX: "viseme_aa",
  viseme_OW: "viseme_O",
  viseme_ER: "viseme_RR",
  viseme_HH: "viseme_kk",
};

/** Every viseme a speech sequence may use: the core set plus detail visemes. */
export const SPEECH_VISEMES = [...AVATAR_VISEMES, ...AVATAR_DETAIL_VISEMES] as const;

export type SpeechViseme = (typeof SPEECH_VISEMES)[number];

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
  viseme: SpeechViseme;
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

export const AVATAR_FRAMINGS = [
  "face",
  "head",
  "head-shoulders",
  "bust",
  "half-body",
  "three-quarter",
  "full-body",
] as const;
export type AvatarFramingName = (typeof AVATAR_FRAMINGS)[number];

/** Human-readable names for {@link AVATAR_FRAMINGS}. */
export const AVATAR_FRAMING_LABELS: Record<AvatarFramingName, string> = {
  face: "Face",
  head: "Head",
  "head-shoulders": "Head & shoulders",
  bust: "Bust",
  "half-body": "Half body",
  "three-quarter": "Three-quarter",
  "full-body": "Full body",
};

export const AVATAR_DYNAMIC_BONE_TYPES = [
  "point",
  "link",
  "mix1",
  "mix2",
  "full",
] as const;
export type AvatarDynamicBoneType = (typeof AVATAR_DYNAMIC_BONE_TYPES)[number];

/** Per-axis value [x, y, z, twist], or one value for every axis. */
export type AvatarDynamicBoneAxes =
  | number
  | readonly [number, number, number, number];

export type AvatarVector3 = readonly [number, number, number];

/**
 * Spring-damper simulation for one optional model bone, such as a hair strand.
 * The simulation rotates or moves the bone's parent, so list a chain's child
 * bones, never its root. Units are metres and seconds.
 */
export interface AvatarDynamicBone {
  bone: string;
  type: AvatarDynamicBoneType;
  stiffness: AvatarDynamicBoneAxes;
  damping: AvatarDynamicBoneAxes;
  external?: number;
  limits?: readonly [
    AvatarDynamicBoneLimit,
    AvatarDynamicBoneLimit,
    AvatarDynamicBoneLimit,
    AvatarDynamicBoneLimit,
  ];
  pivot?: boolean;
  deltaLocal?: AvatarVector3;
  excludes?: readonly AvatarDynamicBoneExclude[];
}

export type AvatarDynamicBoneLimit =
  | readonly [number | null, number | null]
  | null;

export interface AvatarDynamicBoneExclude {
  bone: string;
  radius: number;
  deltaLocal?: AvatarVector3;
}

export interface AvatarAsset {
  id: string;
  name: string;
  modelUrl: string;
  profile: typeof AVATAR_PROFILE_ID;
  hiddenNodes?: readonly string[];
  dynamicBones?: readonly AvatarDynamicBone[];
  framing?: {
    preferred: AvatarFramingName;
    cameraTargetYOffset?: number;
    cameraDistanceScale?: number;
  };
  behavior?: {
    blinkScale?: number;
    expressionScale?: number;
    headMotionScale?: number;
    /** Scales how far TalkingHead's standing idle poses lean away from straight (0–1). */
    poseScale?: number;
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
  /**
   * Scales incidental vertical head motion (idle pitch, breathing lift) from
   * 0 (none) to 1 (full). Yaw, roll, eye movement and gestures are unaffected.
   */
  setVerticalMotion(scale: number): void;
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
    poseScale: value.poseScale,
  };
  for (const [path, scale] of Object.entries(scales)) {
    if (scale !== undefined && (!isFiniteNumber(scale) || scale < 0)) {
      issues.push({
        path: `behavior.${path}`,
        message: "Must be a finite number greater than or equal to zero.",
      });
    }
  }
  if (isFiniteNumber(scales.poseScale) && scales.poseScale > 1) {
    issues.push({
      path: "behavior.poseScale",
      message: "Must be at most 1.",
    });
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
    ...(isFiniteNumber(scales.poseScale) && scales.poseScale <= 1
      ? { poseScale: scales.poseScale }
      : {}),
  };
}

function validateHiddenNodes(
  value: unknown,
  issues: AvatarAssetIssue[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      path: "hiddenNodes",
      message: "Must be an array of non-empty node names.",
    });
    return undefined;
  }

  const names = new Set<string>();
  const hiddenNodes: string[] = [];
  for (const [index, valueAtIndex] of value.entries()) {
    if (typeof valueAtIndex !== "string" || !valueAtIndex.trim()) {
      issues.push({
        path: `hiddenNodes.${index}`,
        message: "Must be a non-empty node name.",
      });
      continue;
    }

    const name = valueAtIndex.trim();
    if (names.has(name)) {
      issues.push({
        path: `hiddenNodes.${index}`,
        message: `Node "${name}" is listed more than once.`,
      });
      continue;
    }
    names.add(name);
    hiddenNodes.push(name);
  }

  return hiddenNodes;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isVector3(value: unknown): value is AvatarVector3 {
  return (
    Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
  );
}

function isDynamicBoneAxes(value: unknown): value is AvatarDynamicBoneAxes {
  if (isFiniteNumber(value)) return value >= 0;
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((axis) => isFiniteNumber(axis) && axis >= 0)
  );
}

function isDynamicBoneLimits(
  value: unknown,
): value is NonNullable<AvatarDynamicBone["limits"]> {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (limit) =>
        limit === null ||
        (Array.isArray(limit) &&
          limit.length === 2 &&
          limit.every((end) => end === null || isFiniteNumber(end))),
    )
  );
}

function validateDynamicBoneExcludes(
  value: unknown,
  path: string,
  issues: AvatarAssetIssue[],
): AvatarDynamicBoneExclude[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Must be an array." });
    return undefined;
  }
  const excludes: AvatarDynamicBoneExclude[] = [];
  for (const [index, exclude] of value.entries()) {
    const at = `${path}.${index}`;
    if (
      !isRecord(exclude) ||
      !isNonEmptyString(exclude.bone) ||
      !isFiniteNumber(exclude.radius) ||
      exclude.radius < 0 ||
      (exclude.deltaLocal !== undefined && !isVector3(exclude.deltaLocal))
    ) {
      issues.push({
        path: at,
        message:
          "Must have a bone name, a non-negative radius and an optional [x, y, z] deltaLocal.",
      });
      continue;
    }
    excludes.push({
      bone: exclude.bone.trim(),
      radius: exclude.radius,
      ...(isVector3(exclude.deltaLocal)
        ? { deltaLocal: exclude.deltaLocal }
        : {}),
    });
  }
  return excludes;
}

function validateDynamicBones(
  value: unknown,
  issues: AvatarAssetIssue[],
): AvatarDynamicBone[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path: "dynamicBones", message: "Must be an array." });
    return undefined;
  }

  const names = new Set<string>();
  const bones: AvatarDynamicBone[] = [];
  for (const [index, item] of value.entries()) {
    const path = `dynamicBones.${index}`;
    if (!isRecord(item)) {
      issues.push({ path, message: "Must be an object." });
      continue;
    }
    const startIssues = issues.length;
    const bone = isNonEmptyString(item.bone) ? item.bone.trim() : "";
    if (!bone) {
      issues.push({
        path: `${path}.bone`,
        message: "Must be a non-empty bone name.",
      });
    } else if (names.has(bone)) {
      issues.push({
        path: `${path}.bone`,
        message: `Bone "${bone}" is listed more than once.`,
      });
    }
    names.add(bone);
    if (!hasValue(AVATAR_DYNAMIC_BONE_TYPES, item.type)) {
      issues.push({
        path: `${path}.type`,
        message: `Must be one of: ${AVATAR_DYNAMIC_BONE_TYPES.join(", ")}.`,
      });
    }
    for (const key of ["stiffness", "damping"] as const) {
      if (!isDynamicBoneAxes(item[key])) {
        issues.push({
          path: `${path}.${key}`,
          message:
            "Must be a non-negative number or an array of four non-negative numbers.",
        });
      }
    }
    if (
      item.external !== undefined &&
      !(isFiniteNumber(item.external) && item.external >= 0 && item.external <= 1)
    ) {
      issues.push({
        path: `${path}.external`,
        message: "Must be a number from 0 to 1.",
      });
    }
    if (item.limits !== undefined && !isDynamicBoneLimits(item.limits)) {
      issues.push({
        path: `${path}.limits`,
        message: "Must be four [low, high] pairs or nulls.",
      });
    }
    if (item.pivot !== undefined && typeof item.pivot !== "boolean") {
      issues.push({ path: `${path}.pivot`, message: "Must be a boolean." });
    }
    if (item.pivot === true && item.type === "point") {
      issues.push({
        path: `${path}.pivot`,
        message: "A point bone cannot be a pivot.",
      });
    }
    if (item.deltaLocal !== undefined && !isVector3(item.deltaLocal)) {
      issues.push({
        path: `${path}.deltaLocal`,
        message: "Must be an [x, y, z] array of numbers.",
      });
    }
    const excludes =
      item.excludes === undefined
        ? undefined
        : validateDynamicBoneExcludes(
            item.excludes,
            `${path}.excludes`,
            issues,
          );

    if (
      issues.length > startIssues ||
      !hasValue(AVATAR_DYNAMIC_BONE_TYPES, item.type) ||
      !isDynamicBoneAxes(item.stiffness) ||
      !isDynamicBoneAxes(item.damping)
    ) {
      continue;
    }
    bones.push({
      bone,
      type: item.type,
      stiffness: item.stiffness,
      damping: item.damping,
      ...(isFiniteNumber(item.external) ? { external: item.external } : {}),
      ...(isDynamicBoneLimits(item.limits) ? { limits: item.limits } : {}),
      ...(typeof item.pivot === "boolean" ? { pivot: item.pivot } : {}),
      ...(isVector3(item.deltaLocal) ? { deltaLocal: item.deltaLocal } : {}),
      ...(excludes ? { excludes } : {}),
    });
  }
  return bones;
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
  const hiddenNodes =
    value.hiddenNodes === undefined
      ? undefined
      : validateHiddenNodes(value.hiddenNodes, issues);
  const dynamicBones =
    value.dynamicBones === undefined
      ? undefined
      : validateDynamicBones(value.dynamicBones, issues);

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    asset: {
      id,
      name,
      modelUrl,
      profile: AVATAR_PROFILE_ID,
      ...(hiddenNodes ? { hiddenNodes } : {}),
      ...(dynamicBones ? { dynamicBones } : {}),
      ...(framing ? { framing } : {}),
      ...(behavior ? { behavior } : {}),
    },
  };
}
