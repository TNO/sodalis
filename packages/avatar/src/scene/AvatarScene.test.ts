import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, type Camera, type Scene } from "three";
import { createAvatarScene } from "./AvatarScene.js";
import type { AvatarAsset } from "../index.js";

const testAsset: AvatarAsset = {
  id: "test",
  name: "Test",
  modelUrl: "/test.glb",
  profile: "sodalis-avatar-0.1",
};

const defaultPixelRatio = window.devicePixelRatio;
const defaultDocumentHidden = document.hidden;

describe("Sodalis avatar scene", () => {
  afterEach(() => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: defaultPixelRatio,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: defaultDocumentHidden,
    });
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("updates the avatar before rendering in one owner-controlled loop", async () => {
    const events: string[] = [];
    const runtime = {
      showAvatar: vi.fn().mockResolvedValue(undefined),
      animate: vi.fn((delta) => events.push(`update:${delta}`)),
      setMood: vi.fn(),
      setValue: vi.fn(),
      opt: {
        avatarIdleHeadMove: 0.15,
        avatarSpeakingHeadMove: 0.15,
      },
      makeEyeContact: vi.fn(),
      lookAt: vi.fn(),
      lookAtCamera: vi.fn(),
      lookAhead: vi.fn(),
      playGesture: vi.fn(),
      stopGesture: vi.fn(),
      dispose: vi.fn(),
    };
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.append(canvas);
    document.body.append(host);
    let hostWidth = 320;
    let hostHeight = 240;
    Object.defineProperty(host, "getBoundingClientRect", {
      value: () => ({ width: hostWidth, height: hostHeight }),
    });

    let frameCallback: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    const cancelFrame = vi.fn();
    const onFpsChange = vi.fn();
    const onError = vi.fn();
    const onReady = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const renderer = {
      setClearColor: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(() => events.push("render")),
      dispose: vi.fn(),
    };
    let avatarCamera: Camera | undefined;
    let avatarScene: Scene | undefined;
    const scene = createAvatarScene(canvas, {
      createRenderer: () => renderer,
      onFpsChange,
      onError,
      onReady,
      createRuntime: (options) => {
        avatarCamera = options.avatarOnlyCamera;
        avatarScene = options.avatarOnlyScene;
        return runtime;
      },
    });

    await scene.controller.load(testAsset);
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(renderer.setSize).toHaveBeenCalledWith(320, 240, false);
    avatarScene?.add(new Group());

    frameCallback?.(1000);
    frameCallback?.(1016);

    expect(runtime.animate).toHaveBeenLastCalledWith(16);
    expect(events.slice(-2)).toEqual(["update:16", "render"]);
    expect(requestFrame).toHaveBeenCalledTimes(3);
    for (let time = 1032; time <= 2024; time += 16) {
      frameCallback?.(time);
    }
    expect(scene.fps).toBeGreaterThan(50);
    expect(onFpsChange).toHaveBeenLastCalledWith(scene.fps);

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    scene.setFraming("head");
    expect(avatarCamera).toHaveProperty("fov", 22);
    scene.setQuality("low");
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    scene.setQuality("medium");
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    scene.setQuality("high");
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    scene.setQuality("auto");
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    hostWidth = 480;
    hostHeight = 360;
    window.dispatchEvent(new Event("resize"));
    expect(renderer.setSize).toHaveBeenLastCalledWith(480, 360, false);
    expect(runtime.showAvatar).toHaveBeenCalledOnce();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(scene.fps).toBeUndefined();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    const lostEvent = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lostEvent);
    expect(lostEvent.defaultPrevented).toBe(true);
    expect(onError).toHaveBeenLastCalledWith(
      new Error("Avatar graphics context was lost."),
    );
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(68);

    scene.dispose();
    expect(cancelFrame).toHaveBeenCalledTimes(3);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(avatarScene?.children).toHaveLength(0);
  });
});
