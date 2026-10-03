import type {
  AvatarUiTargetBounds,
  AvatarUiTargetRegistry,
} from "../index.js";

export function createAvatarUiTargetRegistry(): AvatarUiTargetRegistry {
  const targets = new Map<
    string,
    () => AvatarUiTargetBounds | undefined
  >();

  return {
    register(id, getBounds) {
      const normalizedId = id.trim();
      if (!normalizedId || normalizedId !== id) {
        throw new RangeError("Avatar UI target ids must be non-empty and trimmed.");
      }
      if (typeof getBounds !== "function") {
        throw new TypeError("Avatar UI target bounds must be provided by a function.");
      }
      if (targets.has(id)) {
        throw new Error(`Avatar UI target "${id}" is already registered.`);
      }
      targets.set(id, getBounds);
      return () => {
        if (targets.get(id) === getBounds) targets.delete(id);
      };
    },

    resolve(id) {
      const getBounds = targets.get(id);
      if (!getBounds) return undefined;
      const bounds = getBounds();
      if (!bounds) return undefined;
      if (
        ![
          bounds.left,
          bounds.top,
          bounds.width,
          bounds.height,
        ].every(Number.isFinite) ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        throw new RangeError(`Avatar UI target "${id}" has invalid bounds.`);
      }
      return { ...bounds };
    },
  };
}
