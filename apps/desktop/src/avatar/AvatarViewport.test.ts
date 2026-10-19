// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarBehaviorController } from "@sodalis/avatar";
import {
  createAvatarScene,
  type AvatarSceneHandle,
} from "@sodalis/avatar/internal/scene";
import { AvatarViewport } from "./AvatarViewport.js";
import { AVATAR_CATALOGUE } from "./avatarCatalogue.js";

const assetById = (id: string) =>
  AVATAR_CATALOGUE.find((entry) => entry.asset.id === id)?.asset;
const BRUNETTE = assetById("talkinghead-brunette");
const MALE = assetById("sodalis-male-thuiszorg");

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

  it("loads the given avatar and reports when it is ready", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, {
      view: () => m(AvatarViewport, { asset: BRUNETTE! }),
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
          asset: BRUNETTE!,
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
      view: () => m(AvatarViewport, { asset: BRUNETTE! }),
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
      view: () => m(AvatarViewport, { asset: BRUNETTE! }),
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

  it("reloads the viewer when a different avatar is selected", async () => {
    const first = createSceneHandle();
    const second = createSceneHandle();
    vi.mocked(createAvatarScene)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    let asset = BRUNETTE!;
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, { view: () => m(AvatarViewport, { asset }) });

    await vi.waitFor(() => {
      expect(host.textContent).toContain("Brunette avatar ready.");
    });
    asset = MALE!;
    m.redraw.sync();

    await vi.waitFor(() => {
      expect(host.textContent).toContain("Male avatar ready.");
    });
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.controller.load).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sodalis-male-thuiszorg",
        modelUrl: expect.stringContaining("avatars/sodalis-male-thuiszorg.glb"),
      }),
    );
  });

  it("does not show a stale avatar when the choice changes during loading", async () => {
    const first = createSceneHandle();
    let finishFirstLoad: (() => void) | undefined;
    vi.mocked(first.controller.load).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        finishFirstLoad = resolve;
      }),
    );
    const second = createSceneHandle();
    vi.mocked(createAvatarScene)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    let asset = BRUNETTE!;
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, { view: () => m(AvatarViewport, { asset }) });

    await vi.waitFor(() => expect(finishFirstLoad).toBeDefined());
    asset = MALE!;
    m.redraw.sync();
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Male avatar ready.");
    });
    finishFirstLoad?.();
    await vi.waitFor(() => expect(first.dispose).toHaveBeenCalledOnce());

    expect(host.textContent).not.toContain("Brunette avatar ready.");
    expect(second.controller.load).toHaveBeenCalledOnce();
  });

  it("keeps the failed choice visible and offers a switch to the other avatar", async () => {
    const scene = createSceneHandle();
    vi.mocked(scene.controller.load).mockRejectedValueOnce(
      new Error("The GLB could not be loaded"),
    );
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const select = vi.fn();
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    m.mount(host, {
      view: () =>
        m(AvatarViewport, {
          asset: MALE!,
          switchTo: { name: "Brunette", select },
        }),
    });

    await vi.waitFor(() => {
      expect(host.textContent).toContain(
        "3D avatar unavailable: The GLB could not be loaded",
      );
    });
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Retry avatar",
      "Switch to Brunette",
    ]);
    expect(select).not.toHaveBeenCalled();
    buttons[1]?.click();
    expect(select).toHaveBeenCalledOnce();
  });
});
