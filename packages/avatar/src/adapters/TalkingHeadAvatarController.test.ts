import {
  BoxGeometry,
  Bone,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { createTalkingHeadAvatarController } from "./TalkingHeadAvatarController.js";
import { AVATAR_VISEMES, createAvatarUiTargetRegistry } from "../index.js";
import type { AvatarAsset } from "../index.js";

const testAsset: AvatarAsset = {
  id: "test",
  name: "Test",
  modelUrl: "/test.glb",
  profile: "sodalis-avatar-0.1",
};

interface TestMorph {
  realtime: number | null;
  needsUpdate: boolean;
}

/** TalkingHead's per-morph state, for the visemes an Oculus avatar has. */
function visemeMorphs(names: readonly string[] = AVATAR_VISEMES): Record<string, TestMorph> {
  return Object.fromEntries(
    names.map((name) => [name, { realtime: null, needsUpdate: false }]),
  );
}

function createRuntime() {
  return {
    mtAvatar: visemeMorphs() as Record<string, unknown>,
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

function addIdleRig(scene: Scene) {
  const hips = new Bone();
  hips.name = "Hips";
  const spine = new Bone();
  spine.name = "Spine";
  const spine1 = new Bone();
  spine1.name = "Spine1";
  const spine2 = new Bone();
  spine2.name = "Spine2";
  const head = new Bone();
  head.name = "Head";
  hips.add(spine);
  spine.add(spine1);
  spine1.add(spine2);
  spine2.add(head);
  scene.add(hips);
  return { hips, spine, spine1, spine2, head };
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

  it("passes rigged hair spring bones to the runtime only when configured", async () => {
    const { runtime, controller } = createHarness();
    const dynamicBones = [
      { bone: "Hair1_2", type: "link", stiffness: 20, damping: 2 },
    ] as const;

    await controller.load(testAsset);
    expect(runtime.showAvatar.mock.calls[0]?.[0]).not.toHaveProperty(
      "modelDynamicBones",
    );

    await controller.load({ ...testAsset, id: "rigged", dynamicBones });
    expect(runtime.showAvatar).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelDynamicBones: dynamicBones }),
    );
  });

  it("hides configured model nodes after the avatar loads", async () => {
    const { scene, runtime, controller } = createHarness();
    const glasses = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    glasses.name = "Wolf3D_Glasses";
    const head = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    head.name = "Wolf3D_Head";
    runtime.showAvatar.mockImplementation(async () => {
      scene.add(glasses, head);
    });

    await controller.load({
      ...testAsset,
      hiddenNodes: ["Wolf3D_Glasses"],
    });

    expect(glasses.visible).toBe(false);
    expect(head.visible).toBe(true);
  });

  it("scales incidental vertical head motion without touching yaw, roll or gestures", async () => {
    const mt = (value: number) => ({ value, limit: null as null | ((v: number) => number), needsUpdate: false });
    const runtime = Object.assign(createRuntime(), {
      mtAvatar: {
        bodyRotateX: mt(0.1),
        headRotateX: mt(0.2),
        chestInhale: mt(0.5),
        bodyRotateY: mt(0.3),
      },
    });
    const { scene, controller } = createHarness(runtime);
    const { spine2 } = addIdleRig(scene);
    const baseSpineRotation = spine2.rotation.clone();
    await controller.load(testAsset);
    const pitch = runtime.mtAvatar.bodyRotateX;

    controller.setVerticalMotion(0.4);

    expect(pitch.limit?.(0.1)).toBeCloseTo(0.04);
    expect(pitch.needsUpdate).toBe(true);
    expect(runtime.mtAvatar.headRotateX.limit?.(0.2)).toBeCloseTo(0.08);
    expect(runtime.mtAvatar.chestInhale.limit?.(0.5)).toBeCloseTo(0.2);
    expect(runtime.mtAvatar.bodyRotateY.limit).toBeNull();

    controller.setVerticalMotion(0);
    controller.update(1);
    expect(pitch.limit?.(0.1)).toBe(0);
    expect(spine2.rotation.x).toBe(baseSpineRotation.x);

    void controller.playGesture("nod");
    expect(runtime.mtAvatar.headRotateX.limit?.(0.2)).toBe(0.2);

    controller.setVerticalMotion(1);
    expect(pitch.limit?.(0.1)).toBe(0.1);
    expect(() => controller.setVerticalMotion(1.5)).toThrow(RangeError);
  });

  it("reports when a configured model node is missing", async () => {
    const { controller } = createHarness();

    await expect(
      controller.load({
        ...testAsset,
        hiddenNodes: ["MissingNode"],
      }),
    ).rejects.toThrow('Avatar model node "MissingNode" was not found.');
  });

  it("advances TalkingHead from the external loop in milliseconds", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);

    controller.update(0.016);

    expect(runtime.animate).toHaveBeenCalledWith(16);
  });

  it("adds subtle breathing and weight shifts through the idle update loop", async () => {
    const { scene, runtime, controller } = createHarness();
    const { hips, spine2, head } = addIdleRig(scene);
    const baseHipsRotation = hips.rotation.clone();
    const baseSpineRotation = spine2.rotation.clone();
    const baseHeadRotation = head.rotation.clone();
    await controller.load(testAsset);

    controller.update(1);

    expect(spine2.rotation.x).not.toBe(baseSpineRotation.x);
    expect(hips.rotation.z).not.toBe(baseHipsRotation.z);
    expect(Math.abs(spine2.rotation.x - baseSpineRotation.x)).toBeLessThan(0.02);
    expect(Math.abs(hips.rotation.z - baseHipsRotation.z)).toBeLessThan(0.02);
    expect(head.rotation.toArray()).toEqual(baseHeadRotation.toArray());
    expect(runtime.animate).toHaveBeenCalledOnce();

    await controller.unload();

    expect(hips.rotation.toArray()).toEqual(baseHipsRotation.toArray());
    expect(spine2.rotation.toArray()).toEqual(baseSpineRotation.toArray());
  });

  it("restores the idle pose and suspends body motion for reduced motion", async () => {
    const { scene, controller } = createHarness();
    const { hips, spine2 } = addIdleRig(scene);
    const baseHipsRotation = hips.rotation.clone();
    const baseSpineRotation = spine2.rotation.clone();
    await controller.load(testAsset);

    controller.update(1);
    controller.setReducedMotion(true);

    expect(hips.rotation.toArray()).toEqual(baseHipsRotation.toArray());
    expect(spine2.rotation.toArray()).toEqual(baseSpineRotation.toArray());

    controller.update(1);

    expect(hips.rotation.toArray()).toEqual(baseHipsRotation.toArray());
    expect(spine2.rotation.toArray()).toEqual(baseSpineRotation.toArray());
  });

  it("layers idle sway on TalkingHead's current pose instead of a load-time snapshot", async () => {
    const { scene, runtime, controller } = createHarness();
    const { hips } = addIdleRig(scene);
    await controller.load(testAsset);
    // TalkingHead rewrites the pose bones on every animate().
    runtime.animate.mockImplementation(() => {
      hips.rotation.set(0, 0, 0.2);
    });

    controller.update(1);

    expect(hips.rotation.z).not.toBe(0.2);
    expect(Math.abs(hips.rotation.z - 0.2)).toBeLessThan(0.02);
  });

  it("fades idle body motion out while speaking and during gestures, without a jump", async () => {
    const { scene, controller } = createHarness();
    const { hips, spine2 } = addIdleRig(scene);
    const baseHipsRotation = hips.rotation.clone();
    const baseSpineRotation = spine2.rotation.clone();
    await controller.load(testAsset);
    const swayOffset = () => Math.abs(hips.rotation.z - baseHipsRotation.z);
    controller.update(4);
    const idleOffset = swayOffset();
    expect(idleOffset).toBeGreaterThan(0.001);

    controller.setState("speaking");
    expect(swayOffset()).toBe(idleOffset);
    controller.update(0.016);
    expect(swayOffset()).toBeGreaterThan(0);
    expect(swayOffset()).toBeLessThan(idleOffset);
    controller.update(1);
    expect(hips.rotation.toArray()).toEqual(baseHipsRotation.toArray());
    expect(spine2.rotation.toArray()).toEqual(baseSpineRotation.toArray());

    controller.setState("idle");
    controller.update(1);
    expect(spine2.rotation.x).not.toBe(baseSpineRotation.x);

    controller.startMockSpeech({
      durationSeconds: 2,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_sil", weight: 1 },
        { atSeconds: 2, viseme: "viseme_aa", weight: 1 },
      ],
    });
    controller.update(1);
    expect(hips.rotation.toArray()).toEqual(baseHipsRotation.toArray());

    controller.update(2);
    expect(spine2.rotation.x).not.toBe(baseSpineRotation.x);
    const gesture = controller.playGesture("acknowledge");
    controller.update(0.8);
    await gesture;
    expect(hips.rotation.toArray()).toEqual(baseHipsRotation.toArray());
    expect(spine2.rotation.toArray()).toEqual(baseSpineRotation.toArray());
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

  it("applies development behavior scales to expression and head motion", async () => {
    const { runtime, controller } = createHarness();
    await controller.load({
      ...testAsset,
      behavior: {
        expressionScale: 6,
        headMotionScale: 3,
      },
    });

    expect(runtime.opt.avatarIdleHeadMove).toBeCloseTo(0.45);
    expect(runtime.opt.avatarSpeakingHeadMove).toBeCloseTo(0.45);

    runtime.setValue.mockClear();
    controller.setAffect({
      valence: 0,
      arousal: 0.3,
      expression: "happy",
      intensity: 0.7,
    });

    const smileWeight = runtime.setValue.mock.calls.find(
      ([morph]) => morph === "mouthSmileLeft",
    )?.[1];
    expect(smileWeight).toBeCloseTo(0.6237);
  });

  it("damps standing idle poses toward straight with poseScale", async () => {
    const runtime = {
      ...createRuntime(),
      poseFactory: vi.fn((template: unknown) => ({ template })),
      poseCurrentTemplate: undefined as unknown,
      poseBase: undefined as unknown,
      poseTarget: undefined as unknown,
      poseTemplates: {
        straight: {
          props: {
            "Hips.rotation": { x: 0, y: 0, z: 0 },
            "LeftUpLeg.rotation": { x: 0, y: 0, z: -3.1 },
          },
        },
        hip: { props: { "Hips.rotation": { x: 0.2, y: 0, z: 0.1 } } },
        side: { props: { "LeftUpLeg.rotation": { x: 0, y: 0, z: 3.1 } } },
        kneel: { props: { "Hips.rotation": { x: 1, y: 0, z: 0 } } },
      },
    };
    runtime.poseCurrentTemplate = runtime.poseTemplates.hip;
    const { controller } = createHarness(runtime);
    await controller.load({ ...testAsset, behavior: { poseScale: 0.5 } });

    const hips = runtime.poseTemplates.hip.props["Hips.rotation"];
    expect(hips.x).toBeCloseTo(0.1);
    expect(hips.z).toBeCloseTo(0.05);
    expect(runtime.poseTemplates.kneel.props["Hips.rotation"].x).toBe(1);
    const legs = runtime.poseTemplates.side.props["LeftUpLeg.rotation"];
    expect(Math.abs(Math.abs(legs.z) - Math.PI)).toBeLessThan(0.06);
    expect(runtime.poseBase).toEqual({ template: runtime.poseTemplates.hip });
    expect(runtime.poseTarget).toEqual({ template: runtime.poseTemplates.hip });
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

  it("eases one clamped Oculus viseme in and releases the others", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    runtime.setValue.mockClear();
    const morph = (name: string) => runtime.mtAvatar[name] as TestMorph;

    controller.setViseme("viseme_aa", 1.4);
    controller.update(0.04);
    expect(morph("viseme_aa").realtime).toBeCloseTo(0.5);
    controller.update(0.04);

    expect(morph("viseme_aa").realtime).toBe(1);
    expect(morph("viseme_sil").realtime).toBe(0);
    expect(morph("viseme_PP").realtime).toBe(0);
    expect(runtime.setValue).not.toHaveBeenCalledWith(
      expect.stringMatching(/^viseme_/),
      expect.anything(),
      expect.anything(),
    );
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

  it("drives mock visemes in the same frame, bypassing TalkingHead's smoothing", async () => {
    const { runtime, controller } = createHarness();
    await controller.load(testAsset);
    const morph = (name: string) => runtime.mtAvatar[name] as TestMorph;
    const seenByAnimate: (number | null)[] = [];
    runtime.animate.mockImplementation(() => {
      seenByAnimate.push(morph("viseme_aa").realtime);
    });
    controller.startMockSpeech({
      durationSeconds: 1,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_sil", weight: 1 },
        { atSeconds: 0.5, viseme: "viseme_aa", weight: 1 },
        { atSeconds: 1, viseme: "viseme_sil", weight: 1 },
      ],
    });

    controller.update(0.25);
    expect(morph("viseme_aa").realtime).toBe(0.5);
    expect(morph("viseme_aa").needsUpdate).toBe(true);
    expect(seenByAnimate.at(-1)).toBe(0.5);

    controller.update(0.25);
    expect(morph("viseme_aa").realtime).toBe(1);

    controller.update(0.5);
    expect(morph("viseme_aa").realtime).toBe(0);
    expect(morph("viseme_sil").realtime).toBe(1);
    controller.update(0.016);
    expect(morph("viseme_aa").realtime).toBe(0);
  });

  it("drives detail visemes the avatar has and folds the rest into their core viseme", async () => {
    const sequence = {
      durationSeconds: 1,
      keyframes: [
        { atSeconds: 0, viseme: "viseme_sil" as const, weight: 1 },
        { atSeconds: 0.5, viseme: "viseme_AX" as const, weight: 0.8 },
        { atSeconds: 1, viseme: "viseme_sil" as const, weight: 1 },
      ],
    };
    const detailed = {
      ...createRuntime(),
      mtAvatar: visemeMorphs([...AVATAR_VISEMES, "viseme_AX"]),
    };
    const withDetail = createHarness(detailed);
    await withDetail.controller.load(testAsset);
    withDetail.controller.startMockSpeech(sequence);
    withDetail.controller.update(0.5);
    expect(detailed.mtAvatar.viseme_AX?.realtime).toBe(0.8);
    expect(detailed.mtAvatar.viseme_aa?.realtime).toBe(0);

    const plain = createHarness();
    await plain.controller.load(testAsset);
    plain.controller.startMockSpeech(sequence);
    plain.controller.update(0.5);
    expect((plain.runtime.mtAvatar.viseme_aa as TestMorph).realtime).toBe(0.8);
    expect(plain.runtime.mtAvatar).not.toHaveProperty("viseme_AX");
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
      (runtime.mtAvatar.viseme_aa as TestMorph).realtime as number;
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

    expect((runtime.mtAvatar.viseme_aa as TestMorph).realtime).toBe(0.5);
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
