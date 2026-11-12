import { describe, expect, it } from "vitest";
import { validateEmailSettings } from "./settings.js";

describe("email provider settings", () => {
  it("defaults to off and accepts explicitly selected credential-free mock mode", () => {
    expect(validateEmailSettings({})).toBe("off");
    expect(validateEmailSettings({ COMPANION_HARNESS: "pi", EMAIL_PROVIDER: "mock" }))
      .toBe("mock");
  });

  it.each(["graph", "gmail", "automatic", ""])("rejects unsupported provider selection %j", (EMAIL_PROVIDER) => {
    expect(() => validateEmailSettings({ EMAIL_PROVIDER })).toThrow(/EMAIL_PROVIDER/);
  });

  it("rejects mock selection when the Pi harness is off", () => {
    expect(() => validateEmailSettings({ EMAIL_PROVIDER: "mock" })).toThrow(/COMPANION_HARNESS/);
  });
});
