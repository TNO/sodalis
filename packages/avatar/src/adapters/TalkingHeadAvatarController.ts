/// <reference path="./talkinghead.d.ts" />

import { Euler as ThreeEuler, Quaternion } from "three";
import type { Camera, Euler, Object3D, Scene } from "three";
import {
  AVATAR_DETAIL_VISEME_FALLBACK,
  AVATAR_DETAIL_VISEMES,
  AVATAR_VISEMES,
  SPEECH_VISEMES,
  normalizeAvatarAffect,
  validateAvatarAsset,
  type AvatarAffect,
  type AvatarAsset,
  type AvatarBehaviorController,
  type AvatarDynamicBone,
  type AvatarExpression,
  type AvatarGesture,
  type AvatarLookTarget,
  type MockVisemeSequence,
  type AttentionTargetRegistry,
  type AvatarUiTargetRegistry,
  type AvatarState,
  type AvatarViseme,
  type SpeechViseme,
} from "../index.js";
import {
  createMockVisemeSequence,
  sampleMockVisemeSequence,
} from "../testing/MockVisemeSequence.js";

interface TalkingHeadOptions {
  avatarElement: HTMLElement;
  avatarOnly: true;
  avatarOnlyScene: Scene;
  avatarOnlyCamera: Camera;
  avatarMute: true;
  lipsyncModules: string[];
  cameraRotateEnable: false;
  cameraPanEnable: false;
  cameraZoomEnable: false;
  avatarIdleEyeContact: number;
  avatarIdleHeadMove: number;
  avatarSpeakingEyeContact: number;
  avatarSpeakingHeadMove: number;
}

type PoseTemplateProps = Record<string, { x: number; y: number; z: number }>;

interface TalkingHeadRuntime {
  poseTemplates?: Record<string, { props: PoseTemplateProps }>;
  poseCurrentTemplate?: unknown;
  poseBase?: unknown;
  poseTarget?: unknown;
  poseFactory?(template: unknown): unknown;
  opt: {
    avatarIdleHeadMove: number;
    avatarSpeakingHeadMove: number;
  };
  showAvatar(avatar: {
    url: string;
    avatarMood: string;
    avatarMute: true;
    modelDynamicBones?: readonly AvatarDynamicBone[];
  }): Promise<void>;
  animate(deltaMilliseconds: number): void;
  setMood(mood: string): void;
  setValue(morph: string, value: number, durationMilliseconds?: number): void;
  /** Morph targets the loaded model exposes, keyed by name. */
  mtAvatar?: Record<string, unknown>;
  /** Face morphs TalkingHead drifts at random while idle. */
  mtRandomized?: readonly string[];
  makeEyeContact(durationMilliseconds: number): void;
  lookAt(x: number, y: number, durationMilliseconds: number): void;
  lookAtCamera(durationMilliseconds: number): void;
  lookAhead(durationMilliseconds: number): void;
  playGesture(
    name: string,
    durationSeconds?: number,
    mirror?: boolean,
    transitionMilliseconds?: number,
  ): void;
  stopGesture(transitionMilliseconds?: number): void;
  dispose(): void;
}

type TalkingHeadFactory = (
  options: TalkingHeadOptions,
) => TalkingHeadRuntime | Promise<TalkingHeadRuntime>;

export interface TalkingHeadAvatarControllerOptions {
  scene: Scene;
  camera: Camera;
  avatarElement?: HTMLElement;
  targetRegistry?: AttentionTargetRegistry | AvatarUiTargetRegistry;
  onAvatarLoaded?: (asset: AvatarAsset) => void;
  createRuntime?: TalkingHeadFactory;
}

interface LoadedRuntime {
  instance: TalkingHeadRuntime;
  dispose(): void;
}

/**
 * TalkingHead drifts the idle target (`base`) of some face morphs by up to 0.2
 * above the mood baseline. Scale that drift; other morph sources are untouched.
 */
function scaleIdleFace(runtime: TalkingHeadRuntime, scale: number): void {
  if (scale === 1) return;
  for (const name of runtime.mtRandomized ?? []) {
    const morph = runtime.mtAvatar?.[name] as
      | { base: number | null; baseline: number | null }
      | undefined;
    if (!morph) continue;
    let base = morph.base;
    Object.defineProperty(morph, "base", {
      configurable: true,
      enumerable: true,
      get: () => base,
      set: (value: number | null) => {
        const rest = morph.baseline ?? 0;
        base = value === null ? null : rest + (value - rest) * scale;
      },
    });
  }
}

/** TalkingHead's standing idle poses; kneeling and sitting templates are left alone. */
const IDLE_POSES = ["side", "hip", "turn", "back", "wide"] as const;

function scaleIdlePoses(runtime: TalkingHeadRuntime, scale: number): void {
  const templates = runtime.poseTemplates;
  const straight = templates?.straight?.props;
  if (!templates || !straight || scale === 1) return;
  for (const name of IDLE_POSES) {
    const props = templates[name]?.props;
    if (!props) continue;
    for (const [key, value] of Object.entries(props)) {
      const reference = straight[key];
      if (!reference) continue;
      if (key.endsWith(".rotation")) {
        // Slerp, not Euler lerp: some joints wrap around ±π between templates.
        const from = new Quaternion().setFromEuler(
          new ThreeEuler(reference.x, reference.y, reference.z, "XYZ"),
        );
        const to = new Quaternion().setFromEuler(
          new ThreeEuler(value.x, value.y, value.z, "XYZ"),
        );
        const euler = new ThreeEuler().setFromQuaternion(
          from.slerp(to, scale),
          "XYZ",
        );
        props[key] = { x: euler.x, y: euler.y, z: euler.z };
      } else if (key.endsWith(".position")) {
        props[key] = {
          x: reference.x + (value.x - reference.x) * scale,
          y: reference.y + (value.y - reference.y) * scale,
          z: reference.z + (value.z - reference.z) * scale,
        };
      }
    }
  }
  // The constructor has already built the first pose from the unscaled template;
  // rebuild it the same way.
  if (runtime.poseFactory && runtime.poseCurrentTemplate) {
    runtime.poseBase = runtime.poseFactory(runtime.poseCurrentTemplate);
    runtime.poseTarget = runtime.poseFactory(runtime.poseCurrentTemplate);
  }
}

interface ActiveGesture {
  remainingSeconds: number;
  resolve(): void;
  reject(reason: unknown): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface AmbientPoseJoint {
  node: Object3D;
  /** Rotation before our offset, and the quaternion we wrote on top of it. */
  before?: Euler;
  written?: Quaternion;
}

interface AmbientPose {
  hips?: AmbientPoseJoint;
  spine1?: AmbientPoseJoint;
  spine2?: AmbientPoseJoint;
  elapsedSeconds: number;
  /** 0..1 blend of the idle sway, eased so state changes never snap. */
  weight: number;
}

/** Seconds for the idle sway to fade fully in or out. */
const AMBIENT_FADE_SECONDS = 0.6;

interface VisemeFade {
  from: Record<SpeechViseme, number>;
  to: Record<SpeechViseme, number>;
  elapsedSeconds: number;
  durationSeconds: number;
}

/** TalkingHead's per-morph state; `realtime` bypasses its smoothing. */
interface RealtimeMorph {
  realtime: number | null;
  needsUpdate: boolean;
}

function applyState(
  runtime: TalkingHeadRuntime,
  state: AvatarState,
  avatarElement: HTMLElement,
): void {
  switch (state) {
    case "idle":
      runtime.lookAhead(650);
      break;
    case "thinking": {
      const bounds = avatarElement.getBoundingClientRect();
      runtime.lookAt(
        bounds.left + bounds.width * 0.42,
        bounds.top + bounds.height * 0.4,
        650,
      );
      break;
    }
    case "listening":
      runtime.makeEyeContact(700);
      break;
    case "speaking":
      runtime.makeEyeContact(450);
      break;
    case "interrupted":
      runtime.stopGesture(150);
      runtime.lookAtCamera(250);
      break;
  }
}

async function createDefaultRuntime(
  options: TalkingHeadOptions,
): Promise<TalkingHeadRuntime> {
  const { TalkingHead } = await import("@met4citizen/talkinghead");
  const { avatarElement, ...runtimeOptions } = options;
  return new TalkingHead(avatarElement, runtimeOptions);
}

function validationError(issues: { path: string; message: string }[]): Error {
  return new Error(
    `Invalid avatar asset:\n${issues.map(({ path, message }) => `- ${path}: ${message}`).join("\n")}`,
  );
}

function cancellationError(): Error {
  return new Error("Avatar loading was cancelled.");
}

function silenceWeights(): Record<SpeechViseme, number> {
  return Object.fromEntries(
    SPEECH_VISEMES.map((viseme) => [
      viseme,
      viseme === "viseme_sil" ? 1 : 0,
    ]),
  ) as Record<SpeechViseme, number>;
}

function interpolateWeights(
  from: Readonly<Record<SpeechViseme, number>>,
  to: Readonly<Record<SpeechViseme, number>>,
  progress: number,
): Record<SpeechViseme, number> {
  return Object.fromEntries(
    SPEECH_VISEMES.map((viseme) => [
      viseme,
      from[viseme] + (to[viseme] - from[viseme]) * progress,
    ]),
  ) as Record<SpeechViseme, number>;
}

/** Folds detail visemes the avatar lacks into their core fallback viseme. */
function resolveVisemeWeights(
  weights: Readonly<Record<SpeechViseme, number>>,
  hasMorph: (name: string) => boolean,
): Map<SpeechViseme, number> {
  const resolved = new Map<SpeechViseme, number>(
    AVATAR_VISEMES.map((viseme) => [viseme, weights[viseme]]),
  );
  for (const viseme of AVATAR_DETAIL_VISEMES) {
    if (hasMorph(viseme)) {
      resolved.set(viseme, weights[viseme]);
    } else {
      const fallback = AVATAR_DETAIL_VISEME_FALLBACK[viseme];
      resolved.set(fallback, Math.min(1, resolved.get(fallback)! + weights[viseme]));
    }
  }
  return resolved;
}

const EXPRESSION_MORPHS = [
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "browInnerUp",
  "eyeWideLeft",
  "eyeWideRight",
] as const;
type ExpressionMorph = (typeof EXPRESSION_MORPHS)[number];

function expressionWeights(
  affect: AvatarAffect,
  scale: number,
): Record<ExpressionMorph, number> {
  const expression: AvatarExpression =
    affect.expression ??
    (affect.valence > 0.25
      ? "happy"
      : affect.valence < -0.25
        ? "sad"
        : "neutral");
  const intensity = affect.intensity * (0.75 + affect.arousal * 0.25) * scale;
  const weights = Object.fromEntries(
    EXPRESSION_MORPHS.map((morph) => [morph, 0]),
  ) as Record<ExpressionMorph, number>;

  switch (expression) {
    case "warm":
    case "reassuring":
      weights.mouthSmileLeft = 0.12 * intensity;
      weights.mouthSmileRight = 0.12 * intensity;
      break;
    case "happy":
      weights.mouthSmileLeft = 0.18 * intensity;
      weights.mouthSmileRight = 0.18 * intensity;
      break;
    case "concerned":
      weights.browInnerUp = 0.08 * intensity;
      weights.mouthFrownLeft = 0.06 * intensity;
      weights.mouthFrownRight = 0.06 * intensity;
      break;
    case "sad":
      weights.browInnerUp = 0.1 * intensity;
      weights.mouthFrownLeft = 0.1 * intensity;
      weights.mouthFrownRight = 0.1 * intensity;
      break;
    case "surprised":
      weights.browInnerUp = 0.08 * intensity;
      weights.eyeWideLeft = 0.1 * intensity;
      weights.eyeWideRight = 0.1 * intensity;
      break;
    case "neutral":
      break;
  }
  return weights;
}

export function createTalkingHeadAvatarController({
  scene,
  camera,
  avatarElement = document.createElement("div"),
  targetRegistry,
  onAvatarLoaded,
  createRuntime = createDefaultRuntime,
}: TalkingHeadAvatarControllerOptions): AvatarBehaviorController {
  let loaded: LoadedRuntime | undefined;
  let gazeTarget: AvatarLookTarget = { type: "user" };
  let gazePoint: { x: number; y: number } | undefined;
  let state: AvatarState = "idle";
  let affect: AvatarAffect = {
    valence: 0,
    arousal: 0,
    expression: "neutral",
    intensity: 0,
  };
  let disposed = false;
  let operation = 0;
  let cancelPendingLoad: ((reason: unknown) => void) | undefined;
  let activeGesture: ActiveGesture | undefined;
  let visemeWeights = silenceWeights();
  let appliedVisemeWeights = silenceWeights();
  let visemeFade: VisemeFade | undefined;
  let mockSequence: MockVisemeSequence | undefined;
  let mockElapsedSeconds = 0;
  let postSpeechState: AvatarState = "idle";
  let releaseElapsedSeconds: number | undefined;
  let releaseFromWeights = silenceWeights();
  let reducedMotion = false;
  let expressionScale = 1;
  let headMotionScale = 1;
  let verticalMotionScale = 1;
  let ambientPose: AmbientPose | undefined;

  // TalkingHead passes these morphs through `limit` before posing the
  // skeleton: `bodyRotateX`/`headRotateX` pitch the head, `chestInhale` lifts it.
  const installVerticalMotionLimits = (runtime: TalkingHeadRuntime) => {
    for (const name of ["bodyRotateX", "headRotateX", "chestInhale"]) {
      const morph = runtime.mtAvatar?.[name] as
        | { limit: ((value: number) => number) | null; needsUpdate: boolean }
        | undefined;
      if (!morph) continue;
      morph.limit = (value) =>
        name === "headRotateX" && activeGesture
          ? value
          : value * verticalMotionScale;
      morph.needsUpdate = true;
    }
  };

  const getAmbientPoseJoint = (name: string): AmbientPoseJoint | undefined => {
    const node = scene.getObjectByName(name);
    return node ? { node } : undefined;
  };

  const ambientJoints = (): AmbientPoseJoint[] =>
    ambientPose
      ? [ambientPose.hips, ambientPose.spine1, ambientPose.spine2].filter(
          (joint): joint is AmbientPoseJoint => joint !== undefined,
        )
      : [];

  // TalkingHead rewrites the pose bones each frame; only undo our offset if
  // nothing has written the bone since, so its pose is never overridden.
  const removeAmbientOffset = (joint: AmbientPoseJoint) => {
    if (joint.written && joint.before && joint.node.quaternion.equals(joint.written)) {
      joint.node.rotation.copy(joint.before);
    }
    joint.before = undefined;
    joint.written = undefined;
  };

  const addAmbientOffset = (joint: AmbientPoseJoint, x: number, z: number) => {
    joint.before = joint.node.rotation.clone();
    joint.node.rotation.x += x;
    joint.node.rotation.z += z;
    joint.written = joint.node.quaternion.clone();
  };

  const restoreAmbientPose = () => {
    for (const joint of ambientJoints()) removeAmbientOffset(joint);
    if (ambientPose) ambientPose.weight = 0;
  };

  const captureAmbientPose = () => {
    ambientPose = {
      hips: getAmbientPoseJoint("Hips"),
      spine1: getAmbientPoseJoint("Spine1"),
      spine2: getAmbientPoseJoint("Spine2"),
      elapsedSeconds: 0,
      weight: 0,
    };
  };

  const updateAmbientPose = (deltaSeconds: number) => {
    if (!ambientPose) return;
    for (const joint of ambientJoints()) removeAmbientOffset(joint);
    if (reducedMotion) {
      ambientPose.weight = 0;
      return;
    }
    const target = state === "idle" && !activeGesture ? 1 : 0;
    const step = deltaSeconds / AMBIENT_FADE_SECONDS;
    ambientPose.weight =
      target > ambientPose.weight
        ? Math.min(target, ambientPose.weight + step)
        : Math.max(target, ambientPose.weight - step);
    if (ambientPose.weight === 0) return;
    ambientPose.elapsedSeconds += deltaSeconds;
    const weight = ambientPose.weight;
    const breath =
      Math.sin((ambientPose.elapsedSeconds * Math.PI * 2) / 4.6) * 0.006;
    const sway =
      Math.sin((ambientPose.elapsedSeconds * Math.PI * 2) / 18) * 0.008;

    if (ambientPose.hips) addAmbientOffset(ambientPose.hips, 0, sway * weight);
    if (ambientPose.spine1) {
      addAmbientOffset(ambientPose.spine1, 0, -sway * 0.35 * weight);
    }
    if (ambientPose.spine2) {
      addAmbientOffset(ambientPose.spine2, breath * verticalMotionScale * weight, 0);
    }
  };

  const completeGesture = () => {
    const current = activeGesture;
    if (!current) return;
    activeGesture = undefined;
    if (current.onAbort) {
      current.signal?.removeEventListener("abort", current.onAbort);
    }
    current.resolve();
  };

  const cancelGesture = (reason: unknown) => {
    const current = activeGesture;
    if (!current) return;
    activeGesture = undefined;
    if (current.onAbort) {
      current.signal?.removeEventListener("abort", current.onAbort);
    }
    loaded?.instance.stopGesture(250);
    current.reject(reason);
  };

  const talkingHeadOptions: TalkingHeadOptions = {
    avatarElement,
    avatarOnly: true,
    avatarOnlyScene: scene,
    avatarOnlyCamera: camera,
    avatarMute: true,
    lipsyncModules: [],
    cameraRotateEnable: false,
    cameraPanEnable: false,
    cameraZoomEnable: false,
    avatarIdleEyeContact: 0.25,
    avatarIdleHeadMove: 0.15,
    avatarSpeakingEyeContact: 0.45,
    avatarSpeakingHeadMove: 0.15,
  };

  const applyAffect = (runtime: TalkingHeadRuntime) => {
    const weights = expressionWeights(
      affect,
      Math.min(expressionScale, 6),
    );
    for (const morph of EXPRESSION_MORPHS) {
      runtime.setValue(morph, weights[morph], 220);
    }
  };

  const applyHeadMotionPreference = (runtime?: TalkingHeadRuntime) => {
    const headMove = reducedMotion ? 0 : 0.15 * headMotionScale;
    talkingHeadOptions.avatarIdleHeadMove = headMove;
    talkingHeadOptions.avatarSpeakingHeadMove = headMove;
    if (runtime) {
      runtime.opt.avatarIdleHeadMove = headMove;
      runtime.opt.avatarSpeakingHeadMove = headMove;
    }
  };

  const releaseCurrent = (reason: unknown) => {
    operation += 1;
    cancelPendingLoad?.(reason);
    cancelPendingLoad = undefined;
    cancelGesture(reason);
    restoreAmbientPose();
    ambientPose = undefined;
    mockSequence = undefined;
    releaseElapsedSeconds = undefined;
    setVisemeWeights(silenceWeights(), 0);
    const current = loaded;
    loaded = undefined;
    current?.dispose();
  };

  const requireRuntime = (): TalkingHeadRuntime => {
    if (!loaded) throw new Error("Avatar is not loaded.");
    return loaded.instance;
  };

  const resolveGazePoint = (
    target: AvatarLookTarget,
  ): { x: number; y: number } | undefined => {
    if (target.type === "user") return undefined;
    if (target.type === "screen") {
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
        throw new RangeError("Screen gaze coordinates must be finite.");
      }
      return {
        x: Math.min(window.innerWidth, Math.max(0, target.x)),
        y: Math.min(window.innerHeight, Math.max(0, target.y)),
      };
    }
    if (target.type === "ui-element") {
      const resolved = targetRegistry?.resolve(target.id);
      let bounds:
        | { left: number; top: number; width: number; height: number }
        | undefined;
      if (targetRegistry?.kind === "semantic") {
        if (resolved && "rect" in resolved && resolved.visible) {
          bounds = resolved.rect ?? undefined;
        }
      } else if (resolved && !("rect" in resolved)) {
        bounds = resolved;
      }
      if (!bounds) {
        const targetType =
          targetRegistry?.kind === "semantic"
            ? "Attention target"
            : "Avatar UI target";
        throw new Error(
          `${targetType} "${target.id}" is not visible or registered.`,
        );
      }
      return {
        x: Math.min(
          window.innerWidth,
          Math.max(0, bounds.left + bounds.width / 2),
        ),
        y: Math.min(
          window.innerHeight,
          Math.max(0, bounds.top + bounds.height / 2),
        ),
      };
    }
    throw new Error(
      `Avatar gaze target "${target.type}" requires a registered target resolver.`,
    );
  };

  const applyGazeTarget = (
    runtime: TalkingHeadRuntime,
    target: AvatarLookTarget,
    point: { x: number; y: number } | undefined,
  ) => {
    if (target.type === "user") {
      runtime.lookAtCamera(500);
    } else if (point) {
      runtime.lookAt(point.x, point.y, 500);
    }
  };

  // Visemes go to TalkingHead's `realtime` channel: its `setValue` path eases
  // with acceleration from rest, which lags speech by a few hundred ms and
  // overshoots after it ends. Our own sampling already interpolates.
  const writeVisemeWeights = (weights: Readonly<Record<SpeechViseme, number>>) => {
    appliedVisemeWeights = { ...weights };
    const morphs = loaded?.instance.mtAvatar;
    if (!morphs) return;
    const hasMorph = (name: string) =>
      Object.prototype.hasOwnProperty.call(morphs, name);
    for (const [viseme, weight] of resolveVisemeWeights(weights, hasMorph)) {
      const morph = morphs[viseme] as RealtimeMorph | undefined;
      if (!morph) continue;
      morph.realtime = weight;
      morph.needsUpdate = true;
    }
  };

  /** Sets viseme targets, immediately or eased over `durationMilliseconds`. */
  const setVisemeWeights = (
    nextWeights: Readonly<Record<SpeechViseme, number>>,
    durationMilliseconds: number,
  ) => {
    visemeWeights = { ...nextWeights };
    if (durationMilliseconds > 0) {
      visemeFade = {
        from: { ...appliedVisemeWeights },
        to: { ...nextWeights },
        elapsedSeconds: 0,
        durationSeconds: durationMilliseconds / 1000,
      };
      return;
    }
    visemeFade = undefined;
    writeVisemeWeights(nextWeights);
  };

  const beginInterruption = () => {
    mockSequence = undefined;
    releaseElapsedSeconds = 0;
    releaseFromWeights = { ...visemeWeights };
    cancelGesture(new Error("Avatar gesture was interrupted."));
    state = "interrupted";
    if (loaded) applyState(loaded.instance, state, avatarElement);
  };

  const setState = (nextState: AvatarState) => {
    if (nextState === "interrupted") {
      beginInterruption();
      return;
    }
    if (activeGesture && nextState !== state) {
      cancelGesture(new Error("Avatar gesture was interrupted by a state change."));
    }
    if (mockSequence && nextState !== "speaking") {
      mockSequence = undefined;
      setVisemeWeights(silenceWeights(), 180);
    }
    if (releaseElapsedSeconds !== undefined) {
      setVisemeWeights(silenceWeights(), 180);
    }
    releaseElapsedSeconds = undefined;
    state = nextState;
    if (loaded) applyState(loaded.instance, state, avatarElement);
  };

  const startMockSpeech = (sequence = createMockVisemeSequence()) => {
    const snapshot: MockVisemeSequence = {
      durationSeconds: sequence.durationSeconds,
      keyframes: sequence.keyframes.map((keyframe) => ({ ...keyframe })),
    };
    sampleMockVisemeSequence(snapshot, 0);
    cancelGesture(new Error("Avatar gesture was interrupted by speech."));
    postSpeechState =
      state === "listening" || state === "interrupted" ? "listening" : "idle";
    mockSequence = snapshot;
    mockElapsedSeconds = 0;
    releaseElapsedSeconds = undefined;
    state = "speaking";
    if (loaded) applyState(loaded.instance, state, avatarElement);
    setVisemeWeights(sampleMockVisemeSequence(snapshot, 0), 0);
  };

  return {
    async load(asset, signal) {
      if (disposed) throw new Error("Avatar controller has been disposed.");
      const validation = validateAvatarAsset(asset);
      if (!validation.ok) throw validationError(validation.issues);
      signal?.throwIfAborted();
      expressionScale = validation.asset.behavior?.expressionScale ?? 1;
      headMotionScale = Math.min(
        validation.asset.behavior?.headMotionScale ?? 1,
        3,
      );

      releaseCurrent(new Error("Avatar load was superseded."));
      const currentOperation = operation;
      const runtime = await createRuntime(talkingHeadOptions);
      let runtimeDisposed = false;
      const disposeRuntime = () => {
        if (runtimeDisposed) return;
        runtimeDisposed = true;
        runtime.dispose();
      };

      if (disposed || operation !== currentOperation) {
        disposeRuntime();
        throw cancellationError();
      }
      signal?.throwIfAborted();

      scaleIdlePoses(runtime, validation.asset.behavior?.poseScale ?? 1);
      loaded = { instance: runtime, dispose: disposeRuntime };
      const loadPromise = runtime.showAvatar({
        url: validation.asset.modelUrl,
        avatarMood: "neutral",
        avatarMute: true,
        ...(validation.asset.dynamicBones?.length
          ? { modelDynamicBones: validation.asset.dynamicBones }
          : {}),
      });
      let rejectCancelled!: (reason: unknown) => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        rejectCancelled = reject;
      });
      const cancel = (reason: unknown) => rejectCancelled(reason);
      cancelPendingLoad = cancel;
      const onAbort = () =>
        cancel(signal?.reason ?? new Error("Avatar loading was aborted."));
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        await Promise.race([loadPromise, cancelled]);
        if (disposed || operation !== currentOperation) {
          throw cancellationError();
        }
        if (loaded?.instance === runtime) {
          for (const nodeName of validation.asset.hiddenNodes ?? []) {
            const node = scene.getObjectByName(nodeName);
            if (!node) {
              throw new Error(
                `Avatar model node "${nodeName}" was not found.`,
              );
            }
            node.visible = false;
          }
          captureAmbientPose();
          installVerticalMotionLimits(runtime);
          scaleIdleFace(runtime, validation.asset.behavior?.idleFaceScale ?? 1);
          cancelPendingLoad = undefined;
          applyHeadMotionPreference(runtime);
          runtime.setMood("neutral");
          applyAffect(runtime);
          applyState(runtime, state, avatarElement);
          applyGazeTarget(runtime, gazeTarget, gazePoint);
          onAvatarLoaded?.(validation.asset);
        }
      } catch (error) {
        if (loaded?.instance === runtime) loaded = undefined;
        restoreAmbientPose();
        ambientPose = undefined;
        disposeRuntime();
        void loadPromise.then(disposeRuntime, () => undefined);
        throw error;
      } finally {
        signal?.removeEventListener("abort", onAbort);
        if (cancelPendingLoad === cancel) cancelPendingLoad = undefined;
      }
    },

    async unload() {
      releaseCurrent(new Error("Avatar was unloaded."));
    },

    setState,

    setAffect(nextAffect) {
      affect = normalizeAvatarAffect(nextAffect);
      if (loaded) applyAffect(loaded.instance);
    },

    lookAt(target: AvatarLookTarget) {
      const point = resolveGazePoint(target);
      gazeTarget = target;
      gazePoint = point;
      if (loaded) applyGazeTarget(loaded.instance, target, point);
    },

    resetGaze() {
      gazeTarget = { type: "user" };
      gazePoint = undefined;
      loaded?.instance.lookAtCamera(500);
    },

    async playGesture(gesture: AvatarGesture, signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (gesture === "none") {
        cancelGesture(new Error("Avatar gesture was stopped."));
        loaded?.instance.stopGesture(250);
        return;
      }
      if (reducedMotion) return;
      const definitions: Record<
        Exclude<AvatarGesture, "none">,
        { name: string; durationSeconds: number }
      > = {
        nod: { name: "yes", durationSeconds: 1.2 },
        "shake-head": { name: "no", durationSeconds: 1.2 },
        acknowledge: { name: "handup", durationSeconds: 0.8 },
      };
      const definition = definitions[gesture];
      if (!definition) throw new Error(`Unknown avatar gesture "${gesture}".`);
      const runtime = requireRuntime();
      cancelGesture(new Error("Avatar gesture was superseded."));

      return new Promise<void>((resolve, reject) => {
        const current: ActiveGesture = {
          remainingSeconds: definition.durationSeconds,
          resolve,
          reject,
          ...(signal ? { signal } : {}),
        };
        if (signal) {
          current.onAbort = () =>
            cancelGesture(signal.reason ?? cancellationError());
          signal.addEventListener("abort", current.onAbort, { once: true });
        }
        activeGesture = current;
        try {
          runtime.playGesture(
            definition.name,
            definition.durationSeconds,
            false,
            250,
          );
        } catch (error) {
          activeGesture = undefined;
          if (current.onAbort) {
            signal?.removeEventListener("abort", current.onAbort);
          }
          reject(error);
          return;
        }
        if (signal?.aborted) {
          cancelGesture(signal.reason ?? cancellationError());
        }
      });
    },

    setViseme(viseme: AvatarViseme, weight: number) {
      if (!Number.isFinite(weight)) {
        throw new RangeError("Viseme weight must be a finite number.");
      }
      if (!AVATAR_VISEMES.includes(viseme)) {
        throw new RangeError(`Unknown avatar viseme "${viseme}".`);
      }
      mockSequence = undefined;
      releaseElapsedSeconds = undefined;
      const weights = silenceWeights();
      weights.viseme_sil = 0;
      weights[viseme] = Math.min(1, Math.max(0, weight));
      setVisemeWeights(weights, 80);
    },

    update(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
        throw new RangeError("Avatar delta time must be a finite non-negative number.");
      }
      if (visemeFade) {
        visemeFade.elapsedSeconds += deltaSeconds;
        const progress = Math.min(
          1,
          visemeFade.elapsedSeconds / visemeFade.durationSeconds,
        );
        writeVisemeWeights(
          interpolateWeights(visemeFade.from, visemeFade.to, progress),
        );
        if (progress >= 1) visemeFade = undefined;
      }
      if (mockSequence) {
        mockElapsedSeconds = Math.min(
          mockSequence.durationSeconds,
          mockElapsedSeconds + deltaSeconds,
        );
        if (mockElapsedSeconds >= mockSequence.durationSeconds) {
          mockSequence = undefined;
          setVisemeWeights(silenceWeights(), 0);
          state = postSpeechState;
          if (loaded) applyState(loaded.instance, state, avatarElement);
        } else {
          setVisemeWeights(
            sampleMockVisemeSequence(mockSequence, mockElapsedSeconds),
            0,
          );
        }
      }
      if (releaseElapsedSeconds !== undefined) {
        releaseElapsedSeconds += deltaSeconds;
        const progress = Math.min(1, releaseElapsedSeconds / 0.18);
        const easedRelease = 1 - (1 - progress) ** 2;
        setVisemeWeights(
          interpolateWeights(releaseFromWeights, silenceWeights(), easedRelease),
          0,
        );
        if (progress >= 1) {
          setVisemeWeights(silenceWeights(), 0);
          releaseElapsedSeconds = undefined;
          state = "listening";
          if (loaded) applyState(loaded.instance, state, avatarElement);
        }
      }
      loaded?.instance.animate(deltaSeconds * 1000);
      updateAmbientPose(deltaSeconds);
      if (activeGesture) {
        activeGesture.remainingSeconds -= deltaSeconds;
        if (activeGesture.remainingSeconds <= 0) completeGesture();
      }
    },

    setReducedMotion(reduced) {
      reducedMotion = reduced;
      if (reduced) restoreAmbientPose();
      if (reduced && activeGesture) {
        cancelGesture(new Error("Avatar gesture was stopped by reduced motion."));
      }
      applyHeadMotionPreference(loaded?.instance);
    },

    setVerticalMotion(scale) {
      if (!Number.isFinite(scale) || scale < 0 || scale > 1) {
        throw new RangeError("Vertical motion scale must be between 0 and 1.");
      }
      verticalMotionScale = scale;
      if (loaded) installVerticalMotionLimits(loaded.instance);
    },

    startMockSpeech,

    interrupt: beginInterruption,

    dispose() {
      if (disposed) return;
      disposed = true;
      releaseCurrent(cancellationError());
    },
  };
}
