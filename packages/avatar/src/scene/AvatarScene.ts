import {
  NeutralToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  HemisphereLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  type Texture,
  Scene,
  Vector3,
  WebGLRenderer,
  type Camera,
  type ShadowMapType,
  type ToneMapping,
  type WebGLRendererParameters,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  framingFieldOfView,
  framingSpan,
  framingVerticalMotion,
  type FramingLandmarks,
} from "./framing.js";
import { enhanceStageAvatar, fitShadowCamera } from "./stageRealism.js";
import type {
  AttentionTargetRegistry,
  AvatarUiTargetRegistry,
} from "../index.js";
import {
  createTalkingHeadAvatarController,
  type TalkingHeadAvatarControllerOptions,
} from "../adapters/TalkingHeadAvatarController.js";
import type {
  AvatarBehaviorController,
  AvatarAsset,
  AvatarFramingName,
  AvatarQuality,
} from "../index.js";

interface RendererPort {
  setClearColor(color: number, alpha?: number): void;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
  toneMapping?: ToneMapping;
  toneMappingExposure?: number;
  shadowMap?: { enabled: boolean; type: ShadowMapType };
}

/**
 * `companion` is the light, power-saving desktop look. `stage` is for
 * full-screen evaluation on capable hardware: discrete GPU, full device
 * resolution and three-point studio lighting.
 */
export type AvatarSceneLook = "companion" | "stage";

export interface AvatarSceneOptions {
  createRenderer?: (
    canvas: HTMLCanvasElement,
    options: WebGLRendererParameters,
  ) => RendererPort;
  createRuntime?: TalkingHeadAvatarControllerOptions["createRuntime"];
  targetRegistry?: AttentionTargetRegistry | AvatarUiTargetRegistry;
  look?: AvatarSceneLook;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onFpsChange?: (fps: number | undefined) => void;
}

export interface AvatarSceneHandle {
  controller: AvatarBehaviorController;
  readonly fps: number | undefined;
  setFraming(framing: AvatarFramingName): void;
  setQuality(quality: AvatarQuality): void;
  dispose(): void;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function createAvatarScene(
  canvas: HTMLCanvasElement,
  options: AvatarSceneOptions = {},
): AvatarSceneHandle {
  const host = canvas.parentElement;
  if (!host) throw new Error("Avatar canvas must be attached to a host element.");

  const look = options.look ?? "companion";
  const scene = new Scene();
  let shadowLight: DirectionalLight | undefined;
  if (look === "stage") {
    scene.add(new HemisphereLight(0xf2f4ff, 0x3a3230, 1.1));
    const key = new DirectionalLight(0xfff1e0, 3.2);
    key.position.set(-1.6, 2.6, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.006;
    key.shadow.intensity = 0.6;
    shadowLight = key;
    const fill = new DirectionalLight(0xdce6ff, 1.1);
    fill.position.set(2.2, 1.6, 2);
    const rim = new DirectionalLight(0xffffff, 2.4);
    rim.position.set(0.8, 2.4, -2.6);
    scene.add(key, key.target, fill, rim);
  } else {
    scene.add(new AmbientLight(0xffffff, 1.6));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-2, 3, 4);
    scene.add(keyLight);
  }

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.35, 3.2);
  camera.lookAt(0, 1.25, 0);

  const rendererOptions: WebGLRendererParameters = {
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: look === "stage" ? "high-performance" : "low-power",
  };
  const renderer =
    options.createRenderer?.(canvas, rendererOptions) ??
    new WebGLRenderer(rendererOptions);
  const controller = createTalkingHeadAvatarController({
    scene,
    camera,
    avatarElement: host,
    ...(options.targetRegistry
      ? { targetRegistry: options.targetRegistry }
      : {}),
    onAvatarLoaded: (asset) => {
      const bounds = new Box3().setFromObject(scene);
      if (bounds.isEmpty()) return;
      avatarBounds = bounds;
      if (shadowLight) {
        enhanceStageAvatar(scene);
        fitShadowCamera(shadowLight, bounds);
      }
      framingMetadata = asset.framing;
      if (asset.framing) framing = asset.framing.preferred;
      applyFraming(framing);
      controller.setVerticalMotion(framingVerticalMotion(framing));
    },
    ...(options.createRuntime ? { createRuntime: options.createRuntime } : {}),
  });

  renderer.setClearColor(0x000000, 0);
  let environment: Texture | undefined;
  if (look === "stage") {
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
    }
    // Image-based light gives eyes catch-lights and skin a specular response.
    if (renderer instanceof WebGLRenderer) {
      const pmrem = new PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environment = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
      scene.environment = environment;
      scene.environmentIntensity = 0.45;
    }
  }
  const qualityDprCaps: Record<AvatarQuality, number> = {
    low: 1,
    medium: 1.5,
    high: look === "stage" ? Number.POSITIVE_INFINITY : 2,
    auto: look === "stage" ? Number.POSITIVE_INFINITY : 1.5,
  };
  let framing: AvatarFramingName = "bust";
  let framingMetadata: AvatarAsset["framing"];
  let avatarBounds: Box3 | undefined;
  let quality: AvatarQuality = "auto";
  const applyQuality = () => {
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, qualityDprCaps[quality]),
    );
  };
  applyQuality();

  let disposed = false;
  let contextLost = false;
  let frameHandle: number | undefined;
  let lastFrameTime: number | undefined;
  let fpsWindowStart: number | undefined;
  let fpsWindowFrames = 0;
  let fps: number | undefined;

  const resetFps = (notify = true) => {
    fpsWindowStart = undefined;
    fpsWindowFrames = 0;
    fps = undefined;
    if (notify) options.onFpsChange?.(undefined);
  };

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    const width = Math.max(1, bounds.width || host.clientWidth);
    const height = Math.max(1, bounds.height || host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    applyFraming(framing);
  };

  const landmarkHeight = (name: string) => {
    const joint = scene.getObjectByName(name);
    return joint ? joint.getWorldPosition(new Vector3()).y : undefined;
  };

  const applyFraming = (nextFraming: AvatarFramingName) => {
    camera.fov = framingFieldOfView(nextFraming);
    if (avatarBounds) {
      const size = avatarBounds.getSize(new Vector3());
      if (size.y > 0) {
        const center = avatarBounds.getCenter(new Vector3());
        const landmarks: FramingLandmarks = {
          top: avatarBounds.max.y,
          bottom: avatarBounds.min.y,
        };
        const joints = {
          eye: "LeftEye",
          neck: "Neck",
          shoulder: "LeftArm",
          chest: "Spine2",
          spine1: "Spine1",
          spine: "Spine",
          hips: "Hips",
          knee: "LeftLeg",
          foot: "LeftFoot",
        } as const;
        for (const [key, joint] of Object.entries(joints)) {
          const y = landmarkHeight(joint);
          if (y !== undefined) landmarks[key as keyof typeof joints] = y;
        }
        const span = framingSpan(nextFraming, landmarks);
        const target = new Vector3(
          center.x,
          (span.top + span.bottom) / 2 +
            (framingMetadata?.cameraTargetYOffset ?? 0),
          center.z,
        );
        const halfVerticalFov = (camera.fov * Math.PI) / 360;
        const halfHorizontalFov = Math.atan(
          Math.tan(halfVerticalFov) * camera.aspect,
        );
        const verticalDistance =
          (span.top - span.bottom) / (2 * Math.tan(halfVerticalFov));
        // The A-pose arm span would dominate a wide full-screen stage, so the
        // stage frames by height alone.
        const horizontalDistance =
          look !== "stage" && size.x > 0
            ? Math.min(size.x, span.width) / (2 * Math.tan(halfHorizontalFov))
            : 0;
        // Measured from the front of the face or chest rather than the bounds
        // centre, so close framings do not push the camera into the nose.
        const distance =
          Math.max(verticalDistance, horizontalDistance) *
            (framingMetadata?.cameraDistanceScale ?? 1) +
          Math.min(size.z / 2, 0.15);
        camera.position.set(
          target.x,
          target.y,
          target.z + Math.max(0.1, distance),
        );
        camera.lookAt(target);
      }
    }
    camera.updateProjectionMatrix();
  };

  const setFraming = (nextFraming: AvatarFramingName) => {
    framing = nextFraming;
    applyFraming(framing);
    controller.setVerticalMotion(framingVerticalMotion(framing));
  };

  const setQuality = (nextQuality: AvatarQuality) => {
    if (qualityDprCaps[nextQuality] === undefined) {
      throw new RangeError(`Unknown avatar quality "${nextQuality}".`);
    }
    quality = nextQuality;
    applyQuality();
    resize();
  };

  const stopLoop = () => {
    if (frameHandle === undefined) return;
    cancelAnimationFrame(frameHandle);
    frameHandle = undefined;
  };

  const frame = (time: number) => {
    frameHandle = undefined;
    if (disposed || contextLost || document.hidden) return;

    const deltaSeconds =
      lastFrameTime === undefined
        ? 0
        : Math.min(0.1, Math.max(0, (time - lastFrameTime) / 1000));
    lastFrameTime = time;

    try {
      controller.update(deltaSeconds);
      renderer.render(scene, camera);
      if (fpsWindowStart === undefined) fpsWindowStart = time;
      fpsWindowFrames += 1;
      const elapsed = time - fpsWindowStart;
      if (elapsed >= 1000) {
        fps = (fpsWindowFrames * 1000) / elapsed;
        options.onFpsChange?.(fps);
        fpsWindowStart = time;
        fpsWindowFrames = 0;
      }
    } catch (error) {
      stopLoop();
      options.onError?.(asError(error));
      return;
    }

    frameHandle = requestAnimationFrame(frame);
  };

  const startLoop = () => {
    if (disposed || contextLost || document.hidden || frameHandle !== undefined) {
      return;
    }
    frameHandle = requestAnimationFrame(frame);
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      stopLoop();
      lastFrameTime = undefined;
      resetFps();
    } else {
      startLoop();
    }
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    stopLoop();
    lastFrameTime = undefined;
    resetFps();
    options.onError?.(new Error("Avatar graphics context was lost."));
  };

  const onContextRestored = () => {
    contextLost = false;
    resize();
    options.onReady?.();
    startLoop();
  };

  let resizeObserver: ResizeObserver | undefined;
  resize();
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else {
    window.addEventListener("resize", resize);
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  options.onReady?.();
  startLoop();

  return {
    controller,
    get fps() {
      return fps;
    },
    setFraming,
    setQuality,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      resetFps(false);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      try {
        controller.dispose();
      } finally {
        environment?.dispose();
        renderer.dispose();
        scene.clear();
      }
    },
  };
}
