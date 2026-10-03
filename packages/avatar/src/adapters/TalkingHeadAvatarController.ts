/// <reference path="./talkinghead.d.ts" />

import type { Camera, Euler, Object3D, Scene } from "three";
import {
  AVATAR_VISEMES,
  normalizeAvatarAffect,
  validateAvatarAsset,
  type AvatarAffect,
  type AvatarAsset,
  type AvatarBehaviorController,
  type AvatarExpression,
  type AvatarGesture,
  type AvatarLookTarget,
  type MockVisemeSequence,
  type AttentionTargetRegistry,
  type AvatarUiTargetRegistry,
  type AvatarState,
  type AvatarViseme,
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

interface TalkingHeadRuntime {
  opt: {
    avatarIdleHeadMove: number;
    avatarSpeakingHeadMove: number;
  };
  showAvatar(avatar: {
    url: string;
    avatarMood: string;
    avatarMute: true;
  }): Promise<void>;
  animate(deltaMilliseconds: number): void;
  setMood(mood: string): void;
  setValue(morph: string, value: number, durationMilliseconds?: number): void;
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

interface ActiveGesture {
  remainingSeconds: number;
  resolve(): void;
  reject(reason: unknown): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface AmbientPoseJoint {
  node: Object3D;
  baseRotation: Euler;
}

interface AmbientPose {
  hips?: AmbientPoseJoint;
  spine1?: AmbientPoseJoint;
  spine2?: AmbientPoseJoint;
  elapsedSeconds: number;
  applied: boolean;
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

function silenceWeights(): Record<AvatarViseme, number> {
  return Object.fromEntries(
    AVATAR_VISEMES.map((viseme) => [
      viseme,
      viseme === "viseme_sil" ? 1 : 0,
    ]),
  ) as Record<AvatarViseme, number>;
}

function interpolateWeights(
  from: Readonly<Record<AvatarViseme, number>>,
  to: Readonly<Record<AvatarViseme, number>>,
  progress: number,
): Record<AvatarViseme, number> {
  return Object.fromEntries(
    AVATAR_VISEMES.map((viseme) => [
      viseme,
      from[viseme] + (to[viseme] - from[viseme]) * progress,
    ]),
  ) as Record<AvatarViseme, number>;
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
  let mockSequence: MockVisemeSequence | undefined;
  let mockElapsedSeconds = 0;
  let postSpeechState: AvatarState = "idle";
  let releaseElapsedSeconds: number | undefined;
  let releaseFromWeights = silenceWeights();
  let reducedMotion = false;
  let expressionScale = 1;
  let ambientPose: AmbientPose | undefined;

  const getAmbientPoseJoint = (name: string): AmbientPoseJoint | undefined => {
    const node = scene.getObjectByName(name);
    return node ? { node, baseRotation: node.rotation.clone() } : undefined;
  };

  const restoreAmbientPose = () => {
    if (!ambientPose?.applied) return;
    for (const joint of [
      ambientPose.hips,
      ambientPose.spine1,
      ambientPose.spine2,
    ]) {
      if (joint) joint.node.rotation.copy(joint.baseRotation);
    }
    ambientPose.applied = false;
  };

  const captureAmbientPose = () => {
    ambientPose = {
      hips: getAmbientPoseJoint("Hips"),
      spine1: getAmbientPoseJoint("Spine1"),
      spine2: getAmbientPoseJoint("Spine2"),
      elapsedSeconds: 0,
      applied: false,
    };
  };

  const updateAmbientPose = (deltaSeconds: number) => {
    if (!ambientPose) return;
    if (reducedMotion || state !== "idle" || activeGesture) {
      restoreAmbientPose();
      return;
    }
    ambientPose.elapsedSeconds += deltaSeconds;
    const breath =
      Math.sin((ambientPose.elapsedSeconds * Math.PI * 2) / 4.6) * 0.006;
    const sway =
      Math.sin((ambientPose.elapsedSeconds * Math.PI * 2) / 18) * 0.008;

    for (const joint of [
      ambientPose.hips,
      ambientPose.spine1,
      ambientPose.spine2,
    ]) {
      if (joint) joint.node.rotation.copy(joint.baseRotation);
    }
    if (ambientPose.hips) {
      ambientPose.hips.node.rotation.z += sway;
    }
    if (ambientPose.spine1) {
      ambientPose.spine1.node.rotation.z -= sway * 0.35;
    }
    if (ambientPose.spine2) {
      ambientPose.spine2.node.rotation.x += breath;
    }
    ambientPose.applied = true;
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
      Math.min(expressionScale, 1.5),
    );
    for (const morph of EXPRESSION_MORPHS) {
      runtime.setValue(morph, weights[morph], 220);
    }
  };

  const applyHeadMotionPreference = (runtime?: TalkingHeadRuntime) => {
    const headMove = reducedMotion ? 0 : 0.15;
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
    setVisemeWeights(silenceWeights(), 180);
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

  const setVisemeWeights = (
    nextWeights: Readonly<Record<AvatarViseme, number>>,
    durationMilliseconds: number,
  ) => {
    visemeWeights = { ...nextWeights };
    const runtime = loaded?.instance;
    if (!runtime) return;
    for (const viseme of AVATAR_VISEMES) {
      runtime.setValue(viseme, visemeWeights[viseme], durationMilliseconds);
    }
  };

  const beginInterruption = () => {
    restoreAmbientPose();
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
    if (nextState !== "idle") restoreAmbientPose();
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
    restoreAmbientPose();
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

      loaded = { instance: runtime, dispose: disposeRuntime };
      const loadPromise = runtime.showAvatar({
        url: validation.asset.modelUrl,
        avatarMood: "neutral",
        avatarMute: true,
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
          captureAmbientPose();
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
      restoreAmbientPose();

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
      loaded?.instance.animate(deltaSeconds * 1000);
      updateAmbientPose(deltaSeconds);
      const transitionMilliseconds = Math.min(80, deltaSeconds * 1000);
      if (mockSequence) {
        mockElapsedSeconds = Math.min(
          mockSequence.durationSeconds,
          mockElapsedSeconds + deltaSeconds,
        );
        if (mockElapsedSeconds >= mockSequence.durationSeconds) {
          mockSequence = undefined;
          setVisemeWeights(silenceWeights(), transitionMilliseconds);
          state = postSpeechState;
          if (loaded) applyState(loaded.instance, state, avatarElement);
        } else {
          setVisemeWeights(
            sampleMockVisemeSequence(mockSequence, mockElapsedSeconds),
            transitionMilliseconds,
          );
        }
      }
      if (releaseElapsedSeconds !== undefined) {
        releaseElapsedSeconds += deltaSeconds;
        const progress = Math.min(1, releaseElapsedSeconds / 0.18);
        const easedRelease = 1 - (1 - progress) ** 2;
        setVisemeWeights(
          interpolateWeights(releaseFromWeights, silenceWeights(), easedRelease),
          transitionMilliseconds,
        );
        if (progress >= 1) {
          setVisemeWeights(silenceWeights(), transitionMilliseconds);
          releaseElapsedSeconds = undefined;
          state = "listening";
          if (loaded) applyState(loaded.instance, state, avatarElement);
        }
      }
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

    startMockSpeech,

    interrupt: beginInterruption,

    dispose() {
      if (disposed) return;
      disposed = true;
      releaseCurrent(cancellationError());
    },
  };
}
