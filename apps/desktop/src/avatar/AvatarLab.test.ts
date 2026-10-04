import { describe, expect, it } from "vitest";
import { createAvatarLabState } from "./AvatarLab.js";

describe("Avatar Lab state", () => {
  it("starts with a more visible expression intensity", () => {
    expect(createAvatarLabState().affect.intensity).toBe(0.7);
  });

  it("hides the desktop gaze diagnostic by default", () => {
    expect(createAvatarLabState().showGazeTarget).toBe(false);
  });
});
