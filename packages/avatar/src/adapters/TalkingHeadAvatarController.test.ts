import { PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { createTalkingHeadAvatarController } from "./TalkingHeadAvatarController.js";
import { createAvatarUiTargetRegistry } from "../index.js";
import type { AvatarAsset } from "../index.js";

const testAsset: AvatarAsset = {
  id: "test",
  name: "Test",
  modelUrl: "/test.glb",
  profile: "sodalis-avatar-0.1",
};

function createRuntime() {
  return {
    showAvatar: vi.fn().mockResolvedValue(undefined),
    animate: vi.fn(),
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
}

function createHarness(
  runtime = createRuntime(),
  targetRegistry = createAvatarUiTargetRegistry(),
  runtimeFactory: () => ReturnType<typeof createRuntime> = () => runtime,
) {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const avatarElement = document.createElement("div");
  Object.defineProperty(avatarElement, "getBoundingClientRect", {
    value: () =>
      ({
        left: 100,
        top: 20,
        width: 200,
        height: 100,
      }) as DOMRect,
  });
  const createRuntime = vi.fn(runtimeFactory);
  const controller = createTalkingHeadAvatarController({
    scene,
    camera,
    avatarElement,
    targetRegistry,
    createRuntime,
  });

  return {
    scene,
    camera,
    avatarElement,
    targetRegistry,
    runtime,
    createRuntime,
    controller,
  };
}

describe("TalkingHead avatar controller", () => {
  it("creates an avatar-only runtime bound to the Sodalis scene and camera", async () => {
    const { scene, camera, runtime, createRuntime, controller } =
      createHarness();

    await controller.load(testAsset);

    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarOnly: true,
        avatarOnlyScene: scene,
        avatarOnlyCamera: camera,
        avatarMute: true,
        lipsyncModules: [],
      }),
    );
    expect(runtime.showAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/test.glb" }),
    );
    expect(runtime.lookAhead).toHaveBeenLastCalledWith(650);
  });

  it("advances TalkingHead from the external loop in milliseconds", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.update(0.016);

    expect(runtime.animate).toHaveBeenCalledWith(16);
  });

  it("maps normalized semantic affect to a restrained ARKit expression", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.setAffect({
      valence: 2,
      arousal: 0.4,
      expression: "warm",
      intensity: 1.4,
    });

    expect(runtime.setMood).toHaveBeenLastCalledWith("neutral");
    expect(runtime.setValue).toHaveBeenCalledWith(
      "mouthSmileLeft",
      0.102,
      220,
    );
  });

  it("maps bounded affect intensity to restrained expression morphs", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.setAffect({
      valence: 0,
      arousal: 0,
      expression: "happy",
      intensity: 0.5,
    });

    expect(runtime.setValue).toHaveBeenCalledWith(
      "mouthSmileLeft",
      0.0675,
      220,
    );
    expect(runtime.setValue).toHaveBeenCalledWith(
      "mouthSmileRight",
      0.0675,
      220,
    );
  });

  it("biases listening state toward eye contact", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.setState("listening");

    expect(runtime.makeEyeContact).toHaveBeenLastCalledWith(700);
  });

  it("uses a subtle viewport gaze shift while thinking", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.setState("thinking");

    expect(runtime.lookAt).toHaveBeenLastCalledWith(184, 60, 650);
  });

  it("resolves a semantic UI target to its clamped visual center", async () => {
    const targetRegistry = createAvatarUiTargetRegistry();
    targetRegistry.register("read-message", () => ({
      left: -20,
      top: 100,
      width: 20,
      height: 40,
    }));
    const { runtime, controller } = createHarness(createRuntime(), targetRegistry);
    await controller.load(testAsset);

    controller.lookAt({ type: "ui-element", id: "read-message" });

    expect(runtime.lookAt).toHaveBeenLastCalledWith(0, 120, 500);
  });

  it("retains a semantic gaze target selected before an avatar loads", async () => {
    const targetRegistry = createAvatarUiTargetRegistry();
    targetRegistry.register("read-message", () => ({
      left: 200,
      top: 100,
      width: 80,
      height: 40,
    }));
    const { runtime, controller } = createHarness(createRuntime(), targetRegistry);

    controller.lookAt({ type: "ui-element", id: "read-message" });
    await controller.load(testAsset);

    expect(runtime.lookAt).toHaveBeenLastCalledWith(240, 120, 500);
  });

  it("fails clearly when a UI gaze target is not visible or registered", async () => {
    const registry = createAvatarUiTargetRegistry();
    registry.register("hidden", () => undefined);
    const { controller } = createHarness(createRuntime(), registry);
    await controller.load(testAsset);

    expect(() =>
      controller.lookAt({ type: "ui-element", id: "hidden" }),
    ).toThrow('Avatar UI target "hidden" is not visible or registered.');
  });

  it("applies one clamped Oculus viseme and releases the others", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    runtime.setValue.mockClear();

    controller.setViseme("viseme_aa", 1.4);

    expect(runtime.setValue).toHaveBeenCalledWith("viseme_aa", 1, 80);
    expect(runtime.setValue).toHaveBeenCalledWith("viseme_sil", 0, 80);
    expect(runtime.setValue).toHaveBeenCalledTimes(15);
  });

  it("plays a nod through the semantic head-motion gesture", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    const gesture = controller.playGesture("nod");
    controller.update(1.2);
    await gesture;

    expect(runtime.playGesture).toHaveBeenCalledWith("yes", 1.2, false, 250);
  });

  it("cancels a nod when interrupted", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    const gesture = controller.playGesture("nod");

    controller.setState("interrupted");

    await expect(gesture).rejects.toThrow("Avatar gesture was interrupted.");
    expect(runtime.stopGesture).toHaveBeenCalledWith(250);
  });

  it("cancels a nod when its signal is aborted", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    const abort = new AbortController();
    const reason = new Error("gesture cancelled");
    const gesture = controller.playGesture("nod", abort.signal);

    abort.abort(reason);

    await expect(gesture).rejects.toBe(reason);
    expect(runtime.stopGesture).toHaveBeenCalledWith(250);
  });

  it("plays interpolated mock visemes on the owner update loop", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    runtime.setValue.mockClear();
    controller.startMockSpeech({
      durationSeconds: 1,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_sil", weight: 1 },
        { atSeconds: 1, viseme: "viseme_aa", weight: 1 },
      ],
    });

    controller.update(0.5);

    expect(runtime.setValue).toHaveBeenCalledWith("viseme_sil", 0.5, 80);
    expect(runtime.setValue).toHaveBeenCalledWith("viseme_aa", 0.5, 80);
  });

  it("releases mock visemes smoothly and returns to listening on interruption", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    controller.startMockSpeech({
      durationSeconds: 2,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_aa", weight: 1 },
        { atSeconds: 2, viseme: "viseme_aa", weight: 1 },
      ],
    });
    controller.update(0.2);
    const readAaWeight = () =>
      runtime.setValue.mock.calls
        .filter(([viseme]) => viseme === "viseme_aa")
        .at(-1)?.[1] as number;
    const activeWeight = readAaWeight();

    controller.interrupt();
    controller.update(0.09);
    const releasedWeight = readAaWeight();
    controller.update(0.09);

    expect(activeWeight).toBe(1);
    expect(releasedWeight).toBeLessThan(activeWeight);
    expect(runtime.makeEyeContact).toHaveBeenLastCalledWith(700);
  });

  it("reduces incidental head motion without disabling speaking visemes", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.setReducedMotion(true);
    expect(runtime.opt.avatarIdleHeadMove).toBe(0);
    expect(runtime.opt.avatarSpeakingHeadMove).toBe(0);

    controller.startMockSpeech({
      durationSeconds: 1,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_sil", weight: 1 },
        { atSeconds: 1, viseme: "viseme_aa", weight: 1 },
      ],
    });
    expect(runtime.makeEyeContact).toHaveBeenLastCalledWith(450);
    controller.update(0.5);

    expect(runtime.setValue).toHaveBeenCalledWith("viseme_aa", 0.5, 80);
    controller.setReducedMotion(false);
    expect(runtime.opt.avatarIdleHeadMove).toBe(0.15);
    expect(runtime.opt.avatarSpeakingHeadMove).toBe(0.15);
  });

  it("disposes the avatar runtime on unload", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    await controller.unload();

    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("disposes the previous runtime before reloading another avatar", async () => {
    const firstRuntime = createRuntime();
    const secondRuntime = createRuntime();
    const runtimeFactory = vi
      .fn()
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime);
    const { controller } = createHarness(
      firstRuntime,
      createAvatarUiTargetRegistry(),
      runtimeFactory,
    );

    await controller.load(testAsset);
    await controller.load({ ...testAsset, id: "second" });

    expect(firstRuntime.dispose).toHaveBeenCalledOnce();
    expect(secondRuntime.showAvatar).toHaveBeenCalledOnce();
    await controller.unload();
    expect(secondRuntime.dispose).toHaveBeenCalledOnce();
  });

  it("disposes the runtime and rejects a failed avatar load", async () => {
    const runtime = createRuntime();
    runtime.showAvatar.mockRejectedValue(new Error("Model could not be loaded."));
    const { controller } = createHarness(runtime);

    await expect(controller.load(testAsset)).rejects.toThrow(
      "Model could not be loaded.",
    );

    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("does not create a runtime for an already-aborted load", async () => {
    const { createRuntime, controller } = createHarness();
    const abort = new AbortController();
    const reason = new Error("user cancelled");
    abort.abort(reason);

    await expect(controller.load(testAsset, abort.signal)).rejects.toBe(reason);
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("disposes an in-flight load once it is cancelled", async () => {
    const runtime = createRuntime();
    let finishLoad!: () => void;
    runtime.showAvatar.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const { controller } = createHarness(runtime);
    const abort = new AbortController();
    const reason = new Error("user cancelled");
    const load = controller.load(testAsset, abort.signal);
    await vi.waitFor(() => expect(runtime.showAvatar).toHaveBeenCalledOnce());

    abort.abort(reason);

    await expect(load).rejects.toBe(reason);
    finishLoad();
    await Promise.resolve();
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("rejects malformed assets before creating a runtime", async () => {
    const { createRuntime, controller } = createHarness();

    await expect(
      controller.load({
        id: "",
        name: "",
        modelUrl: "",
        profile: "sodalis-avatar-0.1",
      }),
    ).rejects.toThrow("Invalid avatar asset:");
    expect(createRuntime).not.toHaveBeenCalled();
  });
});
