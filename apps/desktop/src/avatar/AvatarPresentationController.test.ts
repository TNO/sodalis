// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createAvatarPresentationController } from "./AvatarPresentationController.js";

function createStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("AvatarPresentationController", () => {
  it("loads only the persisted dock and visibility preferences", () => {
    const storage = createStorage(
      JSON.stringify({ dock: "left", visible: false }),
    );
    const controller = createAvatarPresentationController({
      storage,
      onError: vi.fn(),
    });

    expect(controller.state).toEqual({
      mode: "ambient",
      dock: "left",
      effectiveDock: "left",
      effectivePlacement: "bottom-left",
      visible: false,
      scale: 1,
      framing: "upper-body",
      reducedMotion: false,
    });
  });

  it("changes presentation mode independently of avatar behavior state", () => {
    const storage = createStorage();
    const controller = createAvatarPresentationController({
      storage,
      onError: vi.fn(),
    });
    const layer = document.createElement("div");
    const viewport = document.createElement("div");
    controller.attach(layer, viewport);

    controller.setMode("conversation");

    expect(controller.state.mode).toBe("conversation");
    expect(layer.dataset.presentationMode).toBe("conversation");
    expect(viewport.style.getPropertyValue("--avatar-presentation-scale")).toBe(
      "1.14",
    );
    expect(controller.state.framing).toBe("upper-body");
  });

  it("docks away from important regions when automatic docking is selected", () => {
    const controller = createAvatarPresentationController({
      storage: createStorage(),
      onError: vi.fn(),
    });
    const layer = document.createElement("div");
    const viewport = document.createElement("div");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1000, 700),
    );
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
      new DOMRect(800, 300, 180, 300),
    );
    controller.attach(layer, viewport);
    controller.setDock("auto");

    controller.setImportantRegions([new DOMRect(780, 280, 200, 350)]);

    expect(controller.state.dock).toBe("auto");
    expect(controller.state.effectiveDock).toBe("left");
    expect(layer.dataset.effectiveDock).toBe("left");
    expect(viewport.style.left).toBe("var(--avatar-edge-margin)");
  });

  it("can move above blocked lower desktop content and stay put under reduced motion", () => {
    const controller = createAvatarPresentationController({
      storage: createStorage(),
      onError: vi.fn(),
    });
    const layer = document.createElement("div");
    const viewport = document.createElement("div");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1000, 700),
    );
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
      new DOMRect(800, 400, 180, 300),
    );
    controller.attach(layer, viewport);
    controller.setDock("auto");
    controller.setImportantRegions([new DOMRect(0, 400, 1000, 300)]);

    expect(controller.state.effectivePlacement).toBe("right-side");

    controller.setReducedMotion(true);
    controller.setImportantRegions([new DOMRect(0, 0, 1000, 700)]);

    expect(controller.state.effectivePlacement).toBe("right-side");
  });

  it("applies scale, framing, and reduced-motion changes through presentation", () => {
    const setFraming = vi.fn();
    const controller = createAvatarPresentationController({
      storage: createStorage(),
      onError: vi.fn(),
      onFramingChange: setFraming,
    });
    const layer = document.createElement("div");
    const viewport = document.createElement("div");
    controller.attach(layer, viewport);

    controller.setScale(1.2);
    controller.setFraming("half-body");
    controller.setReducedMotion(true);

    expect(viewport.style.getPropertyValue("--avatar-presentation-scale")).toBe(
      "1.2",
    );
    expect(viewport.style.getPropertyValue("--avatar-transition-duration")).toBe(
      "0ms",
    );
    expect(layer.dataset.reducedMotion).toBe("true");
    expect(controller.state.framing).toBe("half-body");
    expect(setFraming).toHaveBeenCalledWith("half-body");
  });

  it("persists dock and visibility without storing transient presentation mode", () => {
    const storage = createStorage();
    const controller = createAvatarPresentationController({
      storage,
      onError: vi.fn(),
    });

    controller.setMode("notification");
    controller.setDock("left");
    controller.hide();
    controller.show();

    expect(storage.setItem).toHaveBeenLastCalledWith(
      "sodalis.avatar.presentation.v1",
      JSON.stringify({ dock: "left", visible: true }),
    );
    expect(controller.state.mode).toBe("notification");
    expect(controller.state.visible).toBe(true);
  });
});
