// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarBehaviorController } from "@sodalis/avatar";
import {
  createAvatarScene,
  type AvatarSceneHandle,
} from "@sodalis/avatar/internal/scene";
import { AvatarViewport } from "./AvatarViewport.js";

vi.mock("@sodalis/avatar/internal/scene", () => ({
  createAvatarScene: vi.fn(),
}));

function createSceneHandle(): AvatarSceneHandle {
  const controller: AvatarBehaviorController = {
    load: vi.fn(async () => undefined),
    unload: vi.fn(async () => undefined),
    setState: vi.fn(),
    setAffect: vi.fn(),
    lookAt: vi.fn(),
    resetGaze: vi.fn(),
    playGesture: vi.fn(async () => undefined),
    setViseme: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
    setReducedMotion: vi.fn(),
    startMockSpeech: vi.fn(),
    interrupt: vi.fn(),
  };
  return {
    controller,
    fps: undefined,
    setFraming: vi.fn(),
    setQuality: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("AvatarViewport", () => {
  let mountedHost: HTMLElement | undefined;

  afterEach(() => {
    if (mountedHost) m.mount(mountedHost, null);
    mountedHost = undefined;
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it("loads the selected default avatar and reports when it is ready", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, {
      view: () => m(AvatarViewport, {}),
    });

    await vi.waitFor(() => {
      expect(scene.controller.load).toHaveBeenCalledOnce();
    });
    expect(scene.controller.load).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "talkinghead-brunette",
        name: "Brunette",
        modelUrl: expect.stringContaining("avatars/talkinghead-brunette.glb"),
        hiddenNodes: ["Wolf3D_Glasses"],
        behavior: {
          expressionScale: 6,
          headMotionScale: 3,
        },
      }),
    );
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Brunette avatar ready.");
    });
    expect(host.querySelector(".avatar-gaze-overlay")).toBeNull();
    expect(
      host.querySelector(".avatar-viewport-status-ready")?.textContent,
    ).toBe("Brunette avatar ready.");
  });

  it("shows gaze diagnostics only when explicitly enabled", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, {
      view: () =>
        m(AvatarViewport, {
          showGazeTarget: true,
          gazeOverlay: "Gaze target: Read message",
        }),
    });

    await vi.waitFor(() => {
      expect(scene.controller.load).toHaveBeenCalledOnce();
    });
    expect(host.querySelector(".avatar-gaze-overlay")?.textContent).toBe(
      "Gaze target: Read message",
    );
  });

  it("offers retry when the selected avatar cannot be loaded", async () => {
    const scene = createSceneHandle();
    vi.mocked(scene.controller.load)
      .mockRejectedValueOnce(new Error("The GLB could not be loaded"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, {
      view: () => m(AvatarViewport, {}),
    });

    await vi.waitFor(() => {
      expect(host.textContent).toContain(
        "3D avatar unavailable: The GLB could not be loaded",
      );
    });
    const retry = host.querySelector("button");
    expect(retry?.textContent).toBe("Retry avatar");
    retry?.click();

    await vi.waitFor(() => {
      expect(scene.controller.load).toHaveBeenCalledTimes(2);
      expect(host.textContent).toContain("Brunette avatar ready.");
    });
  });

  it("offers an explicit retry after viewer initialization fails", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene)
      .mockImplementationOnce(() => {
        throw new Error("WebGL unavailable");
      })
      .mockReturnValueOnce(scene);
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, {
      view: () => m(AvatarViewport, {}),
    });

    await vi.waitFor(() => {
      expect(host.textContent).toContain("3D avatar unavailable: WebGL unavailable");
    });
    const retry = host.querySelector("button");
    expect(retry?.textContent).toBe("Retry avatar");
    retry?.click();

    await vi.waitFor(() => {
      expect(createAvatarScene).toHaveBeenCalledTimes(2);
    });
    expect(host.textContent).not.toContain("3D avatar unavailable");
    m.mount(host, null);
    mountedHost = undefined;
    expect(scene.dispose).toHaveBeenCalledOnce();
  });
});
