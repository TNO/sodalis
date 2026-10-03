import {
  AVATAR_FRAMINGS,
  type AvatarFramingName,
} from "@sodalis/avatar";

export const AVATAR_PRESENTATION_MODES = [
  "ambient",
  "conversation",
  "assisting",
  "notification",
] as const;
export type AvatarPresentationMode =
  (typeof AVATAR_PRESENTATION_MODES)[number];

export const AVATAR_DOCK_POSITIONS = ["left", "right", "auto"] as const;
export type AvatarDockPosition = (typeof AVATAR_DOCK_POSITIONS)[number];
export type AvatarDockSide = Exclude<AvatarDockPosition, "auto">;

export interface AvatarPresentationState {
  mode: AvatarPresentationMode;
  dock: AvatarDockPosition;
  effectiveDock: AvatarDockSide;
  visible: boolean;
  scale: number;
  framing: AvatarFramingName;
  reducedMotion: boolean;
}

interface AvatarPresentationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AvatarPresentationControllerOptions {
  storage?: AvatarPresentationStorage;
  onChange?: () => void;
  onError?: (error: Error) => void;
  onFramingChange?: (framing: AvatarFramingName) => void;
}

export interface AvatarPresentationController {
  readonly state: Readonly<AvatarPresentationState>;
  attach(layer: HTMLElement, viewport: HTMLElement): void;
  detach(): void;
  setMode(mode: AvatarPresentationMode): void;
  setDock(position: AvatarDockPosition): void;
  setImportantRegions(regions: readonly DOMRect[]): void;
  setScale(scale: number): void;
  setFraming(framing: AvatarFramingName): void;
  setReducedMotion(reducedMotion: boolean): void;
  show(): void;
  hide(): void;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const PREFERENCES_KEY = "sodalis.avatar.presentation.v1";
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.25;
const TRANSITION_DURATION = "360ms";
const MODE_SCALE: Record<AvatarPresentationMode, number> = {
  ambient: 1,
  conversation: 1.14,
  assisting: 1.08,
  notification: 1.05,
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isDockPosition(value: unknown): value is AvatarDockPosition {
  return AVATAR_DOCK_POSITIONS.some((position) => position === value);
}

function isPresentationMode(value: unknown): value is AvatarPresentationMode {
  return AVATAR_PRESENTATION_MODES.some((mode) => mode === value);
}

function overlapArea(first: Rect, second: Rect): number {
  const width = Math.max(
    0,
    Math.min(first.right, second.right) - Math.max(first.left, second.left),
  );
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
  );
  return width * height;
}

export function createAvatarPresentationController(
  options: AvatarPresentationControllerOptions = {},
): AvatarPresentationController {
  const reportError =
    options.onError ??
    ((error: Error) => console.error("Avatar presentation error:", error));
  let storage = options.storage;
  if (!storage && typeof window !== "undefined") {
    try {
      storage = window.localStorage;
    } catch (error) {
      reportError(asError(error));
    }
  }

  let dock: AvatarDockPosition = "right";
  let visible = true;
  if (storage) {
    try {
      const serialized = storage.getItem(PREFERENCES_KEY);
      if (serialized) {
        const parsed: unknown = JSON.parse(serialized);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("Stored avatar presentation preferences are invalid.");
        }
        const preferences = parsed as {
          dock?: unknown;
          visible?: unknown;
        };
        if (
          !isDockPosition(preferences.dock) ||
          typeof preferences.visible !== "boolean"
        ) {
          throw new Error("Stored avatar presentation preferences are invalid.");
        }
        dock = preferences.dock;
        visible = preferences.visible;
      }
    } catch (error) {
      reportError(asError(error));
    }
  }

  let state: Omit<AvatarPresentationState, "effectiveDock"> = {
    mode: "ambient",
    dock,
    visible,
    scale: 1,
    framing: "upper-body",
    reducedMotion: false,
  };
  let effectiveDock: AvatarDockSide =
    dock === "left" ? "left" : "right";
  let layer: HTMLElement | undefined;
  let viewport: HTMLElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let importantRegions: Rect[] = [];

  const resolveAutoDock = (): AvatarDockSide => {
    if (state.dock !== "auto" || !layer || !viewport) {
      return state.dock === "left" ? "left" : "right";
    }
    if (importantRegions.length === 0) return effectiveDock;

    const layerBounds = layer.getBoundingClientRect();
    const avatarBounds = viewport.getBoundingClientRect();
    const margin = Math.max(
      0,
      effectiveDock === "left"
        ? avatarBounds.left - layerBounds.left
        : layerBounds.right - avatarBounds.right,
    );
    const leftCandidate: Rect = {
      left: layerBounds.left + margin,
      top: avatarBounds.top,
      right: layerBounds.left + margin + avatarBounds.width,
      bottom: avatarBounds.top + avatarBounds.height,
      width: avatarBounds.width,
      height: avatarBounds.height,
    };
    const rightCandidate: Rect = {
      left: layerBounds.right - margin - avatarBounds.width,
      top: avatarBounds.top,
      right: layerBounds.right - margin,
      bottom: avatarBounds.top + avatarBounds.height,
      width: avatarBounds.width,
      height: avatarBounds.height,
    };
    const score = (candidate: Rect) =>
      importantRegions.reduce(
        (total, region) => total + overlapArea(candidate, region),
        0,
      );
    const leftScore = score(leftCandidate);
    const rightScore = score(rightCandidate);
    if (leftScore === rightScore) return effectiveDock;
    return leftScore < rightScore ? "left" : "right";
  };

  const updateView = () => {
    if (!layer || !viewport) return;
    effectiveDock = resolveAutoDock();
    layer.dataset.presentationMode = state.mode;
    layer.dataset.effectiveDock = effectiveDock;
    layer.dataset.visible = String(state.visible);
    layer.dataset.reducedMotion = String(state.reducedMotion);
    layer.setAttribute("aria-hidden", String(!state.visible));
    viewport.style.left =
      effectiveDock === "left"
        ? "var(--avatar-edge-margin)"
        : "calc(100% - var(--avatar-width) - var(--avatar-edge-margin))";
    viewport.style.right = "auto";
    viewport.style.transformOrigin =
      effectiveDock === "left" ? "bottom left" : "bottom right";
    viewport.style.setProperty(
      "--avatar-presentation-scale",
      String(state.scale * MODE_SCALE[state.mode]),
    );
    viewport.style.setProperty(
      "--avatar-transition-duration",
      state.reducedMotion ? "0ms" : TRANSITION_DURATION,
    );
  };

  const notifyChange = () => options.onChange?.();

  const persistPreferences = () => {
    if (!storage) return;
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ dock, visible }));
  };

  const refreshAutoDock = () => {
    const previousDock = effectiveDock;
    updateView();
    if (previousDock !== effectiveDock) notifyChange();
  };

  return {
    get state() {
      return { ...state, effectiveDock };
    },

    attach(nextLayer, nextViewport) {
      resizeObserver?.disconnect();
      layer = nextLayer;
      viewport = nextViewport;
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(refreshAutoDock);
        resizeObserver.observe(layer);
        resizeObserver.observe(viewport);
      }
      updateView();
    },

    detach() {
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      layer = undefined;
      viewport = undefined;
    },

    setMode(mode) {
      if (!isPresentationMode(mode)) {
        throw new RangeError(`Unknown avatar presentation mode "${mode}".`);
      }
      state = { ...state, mode };
      updateView();
      notifyChange();
    },

    setDock(position) {
      if (!isDockPosition(position)) {
        throw new RangeError(`Unknown avatar dock position "${position}".`);
      }
      dock = position;
      state = { ...state, dock };
      updateView();
      notifyChange();
      persistPreferences();
    },

    setImportantRegions(regions) {
      importantRegions = regions.map((region) => ({
        left: region.left,
        top: region.top,
        right: region.right,
        bottom: region.bottom,
        width: region.width,
        height: region.height,
      }));
      const previousDock = effectiveDock;
      updateView();
      if (previousDock !== effectiveDock) notifyChange();
    },

    setScale(scale) {
      if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
        throw new RangeError(
          `Avatar scale must be between ${MIN_SCALE} and ${MAX_SCALE}.`,
        );
      }
      state = { ...state, scale };
      updateView();
      notifyChange();
    },

    setFraming(framing) {
      if (!AVATAR_FRAMINGS.some((option) => option === framing)) {
        throw new RangeError(`Unknown avatar framing "${framing}".`);
      }
      options.onFramingChange?.(framing);
      state = { ...state, framing };
      notifyChange();
    },

    setReducedMotion(reducedMotion) {
      state = { ...state, reducedMotion };
      updateView();
      notifyChange();
    },

    show() {
      state = { ...state, visible: true };
      visible = true;
      updateView();
      notifyChange();
      persistPreferences();
    },

    hide() {
      state = { ...state, visible: false };
      visible = false;
      updateView();
      notifyChange();
      persistPreferences();
    },
  };
}
