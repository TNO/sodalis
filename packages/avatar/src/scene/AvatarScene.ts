import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Camera,
  type WebGLRendererParameters,
} from "three";
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
}

export interface AvatarSceneOptions {
  createRenderer?: (
    canvas: HTMLCanvasElement,
    options: WebGLRendererParameters,
  ) => RendererPort;
  createRuntime?: TalkingHeadAvatarControllerOptions["createRuntime"];
  targetRegistry?: AttentionTargetRegistry | AvatarUiTargetRegistry;
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

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.6));
  const keyLight = new DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-2, 3, 4);
  scene.add(keyLight);

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.35, 3.2);
  camera.lookAt(0, 1.25, 0);

  const rendererOptions: WebGLRendererParameters = {
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
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
      framingMetadata = asset.framing;
      if (asset.framing) framing = asset.framing.preferred;
      applyFraming(framing);
    },
    ...(options.createRuntime ? { createRuntime: options.createRuntime } : {}),
  });

  renderer.setClearColor(0x000000, 0);
  const qualityDprCaps: Record<AvatarQuality, number> = {
    low: 1,
    medium: 1.5,
    high: 2,
    auto: 1.5,
  };
  const framingFov: Record<AvatarFramingName, number> = {
    head: 22,
    "upper-body": 30,
    "half-body": 38,
  };
  const framingHeight: Record<AvatarFramingName, number> = {
    head: 0.28,
    "upper-body": 0.62,
    "half-body": 0.9,
  };
  const framingTargetHeight: Record<AvatarFramingName, number> = {
    head: 0.88,
    "upper-body": 0.68,
    "half-body": 0.56,
  };
  let framing: AvatarFramingName = "upper-body";
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

  const applyFraming = (nextFraming: AvatarFramingName) => {
    const fieldOfView = framingFov[nextFraming];
    if (fieldOfView === undefined) {
      throw new RangeError(`Unknown avatar framing "${nextFraming}".`);
    }
    camera.fov = fieldOfView;
    if (avatarBounds) {
      const size = avatarBounds.getSize(new Vector3());
      if (size.y > 0) {
        const center = avatarBounds.getCenter(new Vector3());
        const head = scene.getObjectByName("Head");
        const targetY =
          nextFraming === "head" && head
            ? head.getWorldPosition(new Vector3()).y
            : avatarBounds.min.y + size.y * framingTargetHeight[nextFraming];
        const target = new Vector3(
          center.x,
          targetY + (framingMetadata?.cameraTargetYOffset ?? 0),
          center.z,
        );
        const halfVerticalFov = (camera.fov * Math.PI) / 360;
        const halfHorizontalFov = Math.atan(
          Math.tan(halfVerticalFov) * camera.aspect,
        );
        const verticalDistance =
          (size.y * framingHeight[nextFraming]) /
          (2 * Math.tan(halfVerticalFov));
        const horizontalDistance =
          size.x > 0 ? size.x / (2 * Math.tan(halfHorizontalFov)) : 0;
        const distance =
          Math.max(verticalDistance, horizontalDistance) *
            (framingMetadata?.cameraDistanceScale ?? 1) +
          size.z / 2;
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
        renderer.dispose();
        scene.clear();
      }
    },
  };
}
