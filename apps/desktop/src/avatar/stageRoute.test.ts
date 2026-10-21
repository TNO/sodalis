import { describe, expect, it } from "vitest";
import { isStageRequested } from "./stageRoute.js";

describe("stage route", () => {
  it("opens the stage only when requested", () => {
    expect(isStageRequested("?stage&avatar=sodalis-sofia")).toBe(true);
    expect(isStageRequested("?avatar=sodalis-sofia")).toBe(false);
  });
});
