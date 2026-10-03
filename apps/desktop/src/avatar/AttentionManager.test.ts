// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  createAttentionTargetRegistry,
  type AvatarController,
} from "@sodalis/avatar";
import {
  createAvatarPresentationController,
  type AvatarPresentationController,
} from "./AvatarPresentationController.js";
import { createAttentionManager } from "./AttentionManager.js";

describe("AttentionManager", () => {
  it("focuses, highlights, avoids, refreshes, and clears one semantic target", () => {
    const element = document.createElement("button");
    document.body.append(element);
    let bounds = new DOMRect(40, 50, 100, 40);
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(
      () => bounds,
    );
    const registry = createAttentionTargetRegistry();
    const unregister = registry.register({
      id: "mail.reply",
      appId: "mail",
      element,
      role: "button",
      label: "Reply",
      importance: "high",
    });
    const controller = {
      lookAt: vi.fn(),
    } as unknown as AvatarController;
    const presentationState = { reducedMotion: false };
    const presentation = {
      state: presentationState,
      setAvoidRegions: vi.fn(),
    } as unknown as AvatarPresentationController;
    const host = document.createElement("main");
    document.body.append(host);
    const attention = createAttentionManager({
      registry,
      presentation,
      getAvatarController: () => controller,
    });
    attention.attach(host);

    attention.focus("mail.reply");

    expect(controller.lookAt).toHaveBeenCalledWith({
      type: "ui-element",
      id: "mail.reply",
    });
    expect(presentation.setAvoidRegions).toHaveBeenCalledWith([
      { rect: new DOMRect(40, 50, 100, 40), importance: 1.5 },
    ]);
    expect(host.querySelector(".attention-highlight")).not.toBeNull();

    presentationState.reducedMotion = true;
    attention.refresh();
    expect(controller.lookAt).toHaveBeenLastCalledWith({
      type: "ui-element",
      id: "mail.reply",
    });
    expect(host.querySelector(".attention-highlight")?.hasAttribute("hidden")).toBe(
      false,
    );

    presentationState.reducedMotion = false;
    attention.refresh();
    expect(controller.lookAt).toHaveBeenLastCalledWith({
      type: "ui-element",
      id: "mail.reply",
    });

    bounds = new DOMRect(80, 90, 140, 50);
    attention.refresh();
    const highlight = host.querySelector<HTMLElement>(".attention-highlight");
    expect(highlight?.style.left).toBe("80px");
    expect(highlight?.style.top).toBe("90px");

    attention.clear();
    expect(
      host.querySelector<HTMLElement>(".attention-highlight")?.hidden,
    ).toBe(true);
    expect(presentation.setAvoidRegions).toHaveBeenLastCalledWith([]);
    expect(controller.lookAt).toHaveBeenLastCalledWith({ type: "user" });

    unregister();
    attention.detach();
  });

  it("uses a focused semantic target to move the avatar to a better dock", () => {
    const element = document.createElement("button");
    document.body.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 400, 1000, 300),
    );
    const registry = createAttentionTargetRegistry();
    registry.register({
      id: "mail.reply",
      appId: "mail",
      element,
      role: "button",
      label: "Reply",
      importance: "high",
    });
    const presentation = createAvatarPresentationController({
      storage: {
        getItem: () => null,
        setItem: vi.fn(),
      },
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
    presentation.attach(layer, viewport);
    presentation.setDock("auto");
    const attention = createAttentionManager({
      registry,
      presentation,
      getAvatarController: () => undefined,
    });

    attention.focus("mail.reply", { gaze: false, highlight: false });

    expect(presentation.state.effectivePlacement).toBe("right-side");
    attention.clear();
    presentation.detach();
  });

  it("applies the selected gaze when the avatar becomes available later", () => {
    const element = document.createElement("button");
    document.body.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(40, 50, 100, 40),
    );
    const registry = createAttentionTargetRegistry();
    registry.register({
      id: "mail.reply",
      appId: "mail",
      element,
      role: "button",
      label: "Reply",
    });
    const controller = { lookAt: vi.fn() } as unknown as AvatarController;
    let avatarController: AvatarController | undefined;
    const presentation = {
      state: { reducedMotion: false },
      setAvoidRegions: vi.fn(),
    } as unknown as AvatarPresentationController;
    const attention = createAttentionManager({
      registry,
      presentation,
      getAvatarController: () => avatarController,
    });

    attention.focus("mail.reply");
    expect(controller.lookAt).not.toHaveBeenCalled();

    avatarController = controller;
    attention.refresh();

    expect(controller.lookAt).toHaveBeenCalledWith({
      type: "ui-element",
      id: "mail.reply",
    });
    attention.clear();
  });
});
