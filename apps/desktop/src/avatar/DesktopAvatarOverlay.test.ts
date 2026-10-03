// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarBehaviorController } from "@sodalis/avatar";
import {
  createAvatarScene,
  type AvatarSceneHandle,
} from "@sodalis/avatar/internal/scene";
import { DesktopAvatarOverlay } from "./DesktopAvatarOverlay.js";

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

describe("DesktopAvatarOverlay", () => {
  let mountedHost: HTMLElement | undefined;

  afterEach(() => {
    if (mountedHost) m.mount(mountedHost, null);
    mountedHost = undefined;
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it("keeps the avatar scene mounted while desktop applications open and close", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    let activeApplication: string | undefined;
    const onScene = vi.fn();

    m.mount(host, {
      view: () =>
        m(".desktop-shell", [
          m("button", {
            onclick: () => {
              activeApplication = activeApplication ? undefined : "Mail";
            },
          }, activeApplication ? `Close ${activeApplication}` : "Open Mail"),
          m(DesktopAvatarOverlay, { onScene }),
        ]),
    });

    await vi.waitFor(() => {
      expect(scene.controller.load).toHaveBeenCalledOnce();
    });
    const canvas = host.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(host.querySelector('[aria-label="Desktop companion"]')).not.toBeNull();
    expect(onScene).toHaveBeenCalledWith(scene);

    (host.querySelector("button") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host.textContent).toContain("Close Mail"));
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(scene.controller.load).toHaveBeenCalledOnce();

    (host.querySelector("button") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host.textContent).toContain("Open Mail"));
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(scene.controller.load).toHaveBeenCalledOnce();

    m.mount(host, null);
    mountedHost = undefined;
    expect(scene.dispose).toHaveBeenCalledOnce();
  });

  it("keeps desktop controls available when avatar initialization fails", async () => {
    vi.mocked(createAvatarScene).mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    const openApplication = vi.fn();

    m.mount(host, {
      view: () =>
        m(".desktop-shell", [
          m("button", { onclick: openApplication }, "Open Mail"),
          m(DesktopAvatarOverlay, {}),
        ]),
    });

    await vi.waitFor(() => {
      expect(host.textContent).toContain("3D avatar unavailable: WebGL unavailable");
    });
    (host.querySelector("button") as HTMLButtonElement).click();

    expect(openApplication).toHaveBeenCalledOnce();
  });
});
