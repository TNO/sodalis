import { describe, expect, it, vi } from "vitest";
import { createAvatarUiTargetRegistry } from "./AvatarUiTargetRegistry.js";

describe("avatar UI gaze targets", () => {
  it("resolves only a registered target's current visual bounds", () => {
    const registry = createAvatarUiTargetRegistry();
    const getBounds = vi.fn(() => ({
      left: 24,
      top: 32,
      width: 120,
      height: 48,
    }));
    registry.register("read-message", getBounds);

    expect(registry.resolve("read-message")).toEqual({
      left: 24,
      top: 32,
      width: 120,
      height: 48,
    });
    expect(getBounds).toHaveBeenCalledOnce();
    expect(registry.resolve("not-registered")).toBeUndefined();
  });

  it("removes a target when its registration is disposed", () => {
    const registry = createAvatarUiTargetRegistry();
    const unregister = registry.register("read-message", () => ({
      left: 0,
      top: 0,
      width: 40,
      height: 40,
    }));

    unregister();

    expect(registry.resolve("read-message")).toBeUndefined();
  });

  it("rejects duplicate identifiers and invalid visible bounds", () => {
    const registry = createAvatarUiTargetRegistry();
    registry.register("read-message", () => ({
      left: 0,
      top: 0,
      width: 40,
      height: 40,
    }));

    expect(() =>
      registry.register("read-message", () => undefined),
    ).toThrow('Avatar UI target "read-message" is already registered.');

    const invalidRegistry = createAvatarUiTargetRegistry();
    invalidRegistry.register("hidden", () => ({
      left: 0,
      top: 0,
      width: 0,
      height: 40,
    }));
    expect(() => invalidRegistry.resolve("hidden")).toThrow(
      'Avatar UI target "hidden" has invalid bounds.',
    );
  });
});
