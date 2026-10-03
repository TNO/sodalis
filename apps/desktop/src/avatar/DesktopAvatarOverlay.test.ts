// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarBehaviorController } from "@sodalis/avatar";
import {
  createAvatarScene,
  type AvatarSceneHandle,
} from "@sodalis/avatar/internal/scene";
import { createAvatarPresentationController } from "./AvatarPresentationController.js";
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

  it("aligns the avatar floor with the live taskbar without reloading the avatar", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const innerDocument = frame.contentDocument;
    if (!innerDocument) throw new Error("The iframe document is unavailable.");
    const taskbar = innerDocument.createElement("nav");
    taskbar.id = "taskbar";
    innerDocument.body.append(taskbar);
    let taskbarBounds = new DOMRect(0, 700, 872, 48);
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 872, 768),
    );
    vi.spyOn(taskbar, "getBoundingClientRect").mockImplementation(
      () => taskbarBounds,
    );
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);

    m.mount(host, {
      view: () => m(DesktopAvatarOverlay, { frame }),
    });
    await vi.waitFor(() => {
      expect(scene.controller.load).toHaveBeenCalledOnce();
    });

    const layer = host.querySelector<HTMLElement>(".desktop-avatar-layer");
    if (!layer) throw new Error("The avatar layer is unavailable.");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 872, 768),
    );
    frame.contentWindow?.dispatchEvent(new Event("resize"));
    expect(layer?.style.getPropertyValue("--avatar-taskbar-bottom")).toBe(
      "calc(100% - 727px)",
    );
    expect(layer.style.getPropertyValue("--avatar-taskbar-clip-bottom")).toBe(
      "68px",
    );

    taskbarBounds = new DOMRect(0, 650, 872, 48);
    frame.contentWindow?.dispatchEvent(new Event("resize"));
    expect(layer?.style.getPropertyValue("--avatar-taskbar-bottom")).toBe(
      "calc(100% - 677px)",
    );
    expect(layer.style.getPropertyValue("--avatar-taskbar-clip-bottom")).toBe(
      "118px",
    );

    taskbarBounds = new DOMRect(0, 768, 0, 0);
    frame.contentWindow?.dispatchEvent(new Event("resize"));
    expect(layer?.style.getPropertyValue("--avatar-taskbar-bottom")).toBe(
      "calc(100% - 771px)",
    );
    expect(layer.style.getPropertyValue("--avatar-taskbar-clip-bottom")).toBe("");

    taskbarBounds = new DOMRect(0, 0, 48, 768);
    frame.contentWindow?.dispatchEvent(new Event("resize"));
    expect(layer?.style.getPropertyValue("--avatar-taskbar-bottom")).toBe(
      "calc(100% - 771px)",
    );
    expect(layer.style.getPropertyValue("--avatar-taskbar-clip-bottom")).toBe("");

    taskbarBounds = new DOMRect(0, 0, 872, 48);
    frame.contentWindow?.dispatchEvent(new Event("resize"));
    expect(layer?.style.getPropertyValue("--avatar-taskbar-bottom")).toBe(
      "calc(100% - 51px)",
    );
    expect(layer.style.getPropertyValue("--avatar-taskbar-clip-bottom")).toBe("");
    expect(scene.controller.load).toHaveBeenCalledOnce();
  });

  it("docks away from visible Aster windows", async () => {
    const scene = createSceneHandle();
    vi.mocked(createAvatarScene).mockReturnValue(scene);
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const innerDocument = frame.contentDocument;
    if (!innerDocument) throw new Error("The iframe document is unavailable.");
    const windowLayer = innerDocument.createElement("div");
    windowLayer.id = "window-layer";
    const desktopWindow = innerDocument.createElement("section");
    desktopWindow.className = "window";
    windowLayer.append(desktopWindow);
    innerDocument.body.append(windowLayer);
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1000, 700),
    );
    vi.spyOn(desktopWindow, "getBoundingClientRect").mockReturnValue(
      new DOMRect(800, 280, 200, 350),
    );
    const host = document.createElement("div");
    mountedHost = host;
    document.body.append(host);
    const presentation = createAvatarPresentationController({
      storage: {
        getItem: () => null,
        setItem: vi.fn(),
      },
      onError: vi.fn(),
    });

    m.mount(host, {
      view: () => m(DesktopAvatarOverlay, { frame, presentation }),
    });
    await vi.waitFor(() => {
      expect(scene.controller.load).toHaveBeenCalledOnce();
    });

    const layer = host.querySelector<HTMLElement>(".desktop-avatar-layer");
    const viewport = host.querySelector<HTMLElement>(".avatar-viewport");
    if (!layer || !viewport) throw new Error("The avatar layer is unavailable.");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1000, 700),
    );
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
      new DOMRect(800, 300, 180, 300),
    );

    presentation.setDock("auto");

    expect(presentation.state.effectiveDock).toBe("left");
    expect(layer.dataset.effectiveDock).toBe("left");
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
