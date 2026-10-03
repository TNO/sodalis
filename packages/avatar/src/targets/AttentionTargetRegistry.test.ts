// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createAttentionTargetRegistry } from "./AttentionTargetRegistry.js";

describe("AttentionTargetRegistry", () => {
  it("resolves semantic metadata with current viewport geometry", () => {
    const element = document.createElement("button");
    document.body.append(element);
    let bounds = new DOMRect(24, 32, 120, 48);
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(
      () => bounds,
    );
    const registry = createAttentionTargetRegistry();
    const unregister = registry.register({
      id: "mail.compose.send",
      appId: "mail",
      element,
      role: "primary-action",
      label: "Send email",
      description: "Sends the currently composed email.",
      importance: "high",
    });

    expect(registry.resolve("mail.compose.send")).toMatchObject({
      id: "mail.compose.send",
      appId: "mail",
      role: "primary-action",
      label: "Send email",
      description: "Sends the currently composed email.",
      importance: "high",
      visible: true,
      rect: new DOMRect(24, 32, 120, 48),
    });

    bounds = new DOMRect(64, 72, 140, 52);
    expect(registry.resolve("mail.compose.send")?.rect).toEqual(bounds);

    unregister();
    expect(registry.resolve("mail.compose.send")).toBeUndefined();
  });

  it("converts same-origin iframe geometry into the desktop viewport", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument) {
      throw new Error("The same-origin frame is unavailable.");
    }
    Object.defineProperty(frameWindow, "innerWidth", {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(frameWindow, "innerHeight", {
      configurable: true,
      value: 100,
    });
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
      new DOMRect(200, 100, 200, 100),
    );
    const element = frameDocument.createElement("button");
    frameDocument.body.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 20, 30, 40),
    );
    const registry = createAttentionTargetRegistry();
    registry.register({
      id: "settings.save",
      appId: "settings",
      element,
      role: "button",
      label: "Save",
    });

    expect(registry.resolve("settings.save")?.rect).toEqual(
      new DOMRect(220, 120, 60, 40),
    );
  });
});
