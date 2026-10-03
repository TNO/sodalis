export interface AvatarUiTargetBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type AttentionImportance = "low" | "normal" | "high";

export interface AttentionTargetRegistration {
  id: string;
  appId: string;
  element: HTMLElement;
  role: string;
  label: string;
  description?: string;
  importance?: AttentionImportance;
}

export interface AttentionTarget {
  id: string;
  appId: string;
  role: string;
  label: string;
  description?: string;
  importance: AttentionImportance;
  visible: boolean;
  rect: DOMRectReadOnly | null;
}

export interface AttentionTargetRegistry {
  readonly kind: "semantic";
  register(target: AttentionTargetRegistration): () => void;
  resolve(id: string): AttentionTarget | undefined;
}

export interface AvatarUiTargetRegistry {
  readonly kind: "legacy";
  register(
    id: string,
    getBounds: () => AvatarUiTargetBounds | undefined,
  ): () => void;
  resolve(id: string): AvatarUiTargetBounds | undefined;
}

interface StoredTarget {
  metadata: Omit<AttentionTarget, "visible" | "rect">;
  getBounds: () => AvatarUiTargetBounds | undefined;
}

function validateBounds(
  id: string,
  bounds: AvatarUiTargetBounds,
  allowEmpty: boolean,
): void {
  if (
    ![bounds.left, bounds.top, bounds.width, bounds.height].every(
      Number.isFinite,
    ) ||
    bounds.width < 0 ||
    bounds.height < 0 ||
    (!allowEmpty && (bounds.width === 0 || bounds.height === 0))
  ) {
    throw new RangeError(`Attention target "${id}" has invalid bounds.`);
  }
}

function isHtmlElement(value: unknown): value is HTMLElement {
  if (typeof value !== "object" || value === null) return false;
  const view = (value as HTMLElement).ownerDocument?.defaultView;
  return view !== null && view !== undefined && value instanceof view.HTMLElement;
}

function resolveElementBounds(element: HTMLElement): AvatarUiTargetBounds | undefined {
  if (!element.isConnected) return undefined;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    element.hidden ||
    style?.display === "none" ||
    style?.visibility === "hidden" ||
    style?.visibility === "collapse" ||
    style?.opacity === "0"
  ) {
    return undefined;
  }

  const local = element.getBoundingClientRect();
  if (local.width <= 0 || local.height <= 0) return undefined;

  let bounds: AvatarUiTargetBounds = {
    left: local.left,
    top: local.top,
    width: local.width,
    height: local.height,
  };
  let view = element.ownerDocument.defaultView;
  while (view?.frameElement) {
    const frame = view.frameElement;
    const frameBounds = frame.getBoundingClientRect();
    const scaleX = view.innerWidth > 0 ? frameBounds.width / view.innerWidth : 1;
    const scaleY = view.innerHeight > 0 ? frameBounds.height / view.innerHeight : 1;
    bounds = {
      left: frameBounds.left + bounds.left * scaleX,
      top: frameBounds.top + bounds.top * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    };
    view = frame.ownerDocument.defaultView;
  }
  if (!view) return bounds;
  const right = Math.min(view.innerWidth, bounds.left + bounds.width);
  const bottom = Math.min(view.innerHeight, bounds.top + bounds.height);
  const left = Math.max(0, bounds.left);
  const top = Math.max(0, bounds.top);
  if (right <= left || bottom <= top) return undefined;
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function createTargetStore() {
  const targets = new Map<string, StoredTarget>();

  const register = (
    metadata: StoredTarget["metadata"],
    getBounds: StoredTarget["getBounds"],
    legacy = false,
  ): (() => void) => {
    if (targets.has(metadata.id)) {
      const prefix = legacy ? "Avatar UI target" : "Attention target";
      throw new Error(`${prefix} "${metadata.id}" is already registered.`);
    }
    const stored = { metadata, getBounds };
    targets.set(metadata.id, stored);
    return () => {
      if (targets.get(metadata.id) === stored) targets.delete(metadata.id);
    };
  };

  return {
    registerSemantic(target: AttentionTargetRegistration): () => void {
      if (!target || typeof target !== "object") {
        throw new TypeError("An attention target registration is required.");
      }
      for (const [field, value] of [
        ["id", target.id],
        ["appId", target.appId],
        ["role", target.role],
        ["label", target.label],
      ] as const) {
        if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
          throw new RangeError(`Attention target ${field} must be non-empty and trimmed.`);
        }
      }
      if (!isHtmlElement(target.element)) {
        throw new TypeError("Attention target element must be an HTMLElement.");
      }
      const importance = target.importance ?? "normal";
      if (!["low", "normal", "high"].includes(importance)) {
        throw new RangeError(`Unknown attention importance "${importance}".`);
      }
      if (
        target.description !== undefined &&
        (typeof target.description !== "string" ||
          target.description !== target.description.trim())
      ) {
        throw new RangeError("Attention target description must be trimmed.");
      }
      const metadata = {
        id: target.id,
        appId: target.appId,
        role: target.role,
        label: target.label,
        ...(target.description ? { description: target.description } : {}),
        importance,
      };
      return register(metadata, () => resolveElementBounds(target.element));
    },

    registerLegacy(
      id: string,
      getBounds: () => AvatarUiTargetBounds | undefined,
    ): () => void {
      if (!id || id.trim() !== id) {
        throw new RangeError("Avatar UI target ids must be non-empty and trimmed.");
      }
      if (typeof getBounds !== "function") {
        throw new TypeError("Avatar UI target bounds must be provided by a function.");
      }
      return register(
        {
          id,
          appId: "legacy",
          role: "region",
          label: id,
          importance: "normal",
        },
        getBounds,
        true,
      );
    },

    resolve(id: string): AttentionTarget | undefined {
      const target = targets.get(id);
      if (!target) return undefined;
      const bounds = target.getBounds();
      if (!bounds) return { ...target.metadata, visible: false, rect: null };
      validateBounds(id, bounds, true);
      if (bounds.width === 0 || bounds.height === 0) {
        return { ...target.metadata, visible: false, rect: null };
      }
      return {
        ...target.metadata,
        visible: true,
        rect: new DOMRect(bounds.left, bounds.top, bounds.width, bounds.height),
      };
    },

    resolveLegacy(id: string): AvatarUiTargetBounds | undefined {
      const target = targets.get(id);
      if (!target) return undefined;
      const bounds = target.getBounds();
      if (!bounds) return undefined;
      if (
        ![bounds.left, bounds.top, bounds.width, bounds.height].every(
          Number.isFinite,
        ) ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        throw new RangeError(`Avatar UI target "${id}" has invalid bounds.`);
      }
      return { ...bounds };
    },
  };
}

export function createAttentionTargetRegistry(): AttentionTargetRegistry {
  const store = createTargetStore();
  return {
    kind: "semantic",
    register: (target) => store.registerSemantic(target),
    resolve: (id) => store.resolve(id),
  };
}

export function createAvatarUiTargetRegistry(): AvatarUiTargetRegistry {
  const store = createTargetStore();
  return {
    kind: "legacy",
    register: (id, getBounds) => store.registerLegacy(id, getBounds),
    resolve: (id) => store.resolveLegacy(id),
  };
}
