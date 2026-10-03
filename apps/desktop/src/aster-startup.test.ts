// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import coreSource from "../public/aster/src/core.js?raw";

interface AsterStartupApi {
  startupErrorMessage(error: unknown): string;
}

describe("Aster startup failure reporting", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "Aster");
  });

  it("describes a null startup rejection without throwing another TypeError", async () => {
    window.eval(coreSource);

    const aster = (window as Window & { Aster?: AsterStartupApi }).Aster;
    expect(aster?.startupErrorMessage(null)).toBe(
      "Aster startup failed without an error object.",
    );
  });
});
