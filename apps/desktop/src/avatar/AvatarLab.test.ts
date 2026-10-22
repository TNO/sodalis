// @vitest-environment jsdom


import m from "mithril";
import { describe, expect, it } from "vitest";
import type { AttentionManager } from "./AttentionManager.js";
import { createAvatarLab, createAvatarLabState } from "./AvatarLab.js";
import { createAvatarPresentationController } from "./AvatarPresentationController.js";

const attention = {
  register: () => () => undefined,
} as unknown as AttentionManager;

function renderLab(withPresentation: boolean): string[] {
  const root = document.createElement("div");
  const Lab = createAvatarLab();
  m.render(
    root,
    m(Lab, {
      attention,
      value: createAvatarLabState(),
      ...(withPresentation
        ? { presentation: createAvatarPresentationController({ storage: undefined }) }
        : {}),
    }),
  );
  return [...root.querySelectorAll("label")].map((label) =>
    (label.textContent ?? "").trim(),
  );
}

describe("Avatar Lab state", () => {
  it("starts with a more visible expression intensity", () => {
    expect(createAvatarLabState().affect.intensity).toBe(0.7);
  });

  it("hides the desktop gaze diagnostic by default", () => {
    expect(createAvatarLabState().showGazeTarget).toBe(false);
  });
});

describe("Avatar Lab", () => {
  it("offers desktop presentation controls only when there is a desktop presentation", () => {
    const desktopOnly = ["Presentation", "Dock", "Show avatar on desktop", "Size"];
    const onDesktop = renderLab(true);
    const onStage = renderLab(false);

    for (const label of desktopOnly) {
      expect(onDesktop.some((text) => text.startsWith(label))).toBe(true);
      expect(onStage.some((text) => text.startsWith(label))).toBe(false);
    }
    expect(onStage.some((text) => text.startsWith("Framing"))).toBe(true);
  });
});
