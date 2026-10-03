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
export const AVATAR_PLACEMENTS = [
  "bottom-left",
  "bottom-right",
  "left-side",
  "right-side",
] as const;
export type AvatarPlacement = (typeof AVATAR_PLACEMENTS)[number];
export interface AvatarAvoidRegion {
  rect: DOMRectReadOnly;
  importance?: number;
}

export interface AvatarPresentationState {
  mode: AvatarPresentationMode;
  dock: AvatarDockPosition;
  effectiveDock: AvatarDockSide;
  effectivePlacement: AvatarPlacement;
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
  setImportantRegions(regions: readonly DOMRectReadOnly[]): void;
  setAvoidRegions(regions: readonly AvatarAvoidRegion[]): void;
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

function placementSide(placement: AvatarPlacement): AvatarDockSide {
  return placement === "bottom-left" || placement === "left-side"
    ? "left"
    : "right";
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

function copyRegionBounds(region: DOMRectReadOnly): Rect {
  const bounds = {
    left: region.left,
    top: region.top,
    right: region.right,
    bottom: region.bottom,
    width: region.width,
    height: region.height,
  };
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new RangeError("Attention regions must have finite positive bounds.");
  }
  return bounds;
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

  let state: Omit<
    AvatarPresentationState,
    "effectiveDock" | "effectivePlacement"
  > = {
    mode: "ambient",
    dock,
    visible,
    scale: 1,
    framing: "upper-body",
    reducedMotion: false,
  };
  let effectivePlacement: AvatarPlacement =
    dock === "left" ? "bottom-left" : "bottom-right";
  let layer: HTMLElement | undefined;
  let viewport: HTMLElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let importantRegions: Rect[] = [];
  let avoidRegions: Array<{ bounds: Rect; importance: number }> = [];

  const resolveAutoPlacement = (): AvatarPlacement => {
    if (state.dock !== "auto" || !layer || !viewport || state.reducedMotion) {
      return effectivePlacement;
    }
    if (importantRegions.length === 0 && avoidRegions.length === 0) {
      return effectivePlacement;
    }

    const layerBounds = layer.getBoundingClientRect();
    const avatarBounds = viewport.getBoundingClientRect();
    const margin = Math.max(
      0,
      Math.min(
        avatarBounds.left - layerBounds.left,
        layerBounds.right - avatarBounds.right,
      ),
    );
    const centeredTop =
      layerBounds.top + (layerBounds.height - avatarBounds.height) / 2;
    const candidates: Array<{ placement: AvatarPlacement; bounds: Rect }> = [
      {
        placement: "bottom-right",
        bounds: {
          left: layerBounds.right - margin - avatarBounds.width,
          top: avatarBounds.top,
          right: layerBounds.right - margin,
          bottom: avatarBounds.top + avatarBounds.height,
          width: avatarBounds.width,
          height: avatarBounds.height,
        },
      },
      {
        placement: "bottom-left",
        bounds: {
          left: layerBounds.left + margin,
          top: avatarBounds.top,
          right: layerBounds.left + margin + avatarBounds.width,
          bottom: avatarBounds.top + avatarBounds.height,
          width: avatarBounds.width,
          height: avatarBounds.height,
        },
      },
      {
        placement: "right-side",
        bounds: {
          left: layerBounds.right - margin - avatarBounds.width,
          top: centeredTop,
          right: layerBounds.right - margin,
          bottom: centeredTop + avatarBounds.height,
          width: avatarBounds.width,
          height: avatarBounds.height,
        },
      },
      {
        placement: "left-side",
        bounds: {
          left: layerBounds.left + margin,
          top: centeredTop,
          right: layerBounds.left + margin + avatarBounds.width,
          bottom: centeredTop + avatarBounds.height,
          width: avatarBounds.width,
          height: avatarBounds.height,
        },
      },
    ];
    const score = (candidate: Rect) =>
      importantRegions.reduce(
        (total, region) => total + overlapArea(candidate, region),
        0,
      ) +
      avoidRegions.reduce(
        (total, region) =>
          total + overlapArea(candidate, region.bounds) * region.importance,
        0,
      );
    const scores = candidates.map(({ bounds }) => score(bounds));
    const bestScore = Math.min(...scores);
    const currentIndex = candidates.findIndex(
      ({ placement }) => placement === effectivePlacement,
    );
    if (currentIndex >= 0 && scores[currentIndex] === bestScore) {
      return effectivePlacement;
    }
    const bestIndex = scores.indexOf(bestScore);
    return candidates[bestIndex]!.placement;
  };

  const updateView = () => {
    if (!layer || !viewport) return;
    effectivePlacement = resolveAutoPlacement();
    const effectiveDock = placementSide(effectivePlacement);
    layer.dataset.presentationMode = state.mode;
    layer.dataset.effectiveDock = effectiveDock;
    layer.dataset.effectivePlacement = effectivePlacement;
    layer.dataset.visible = String(state.visible);
    layer.dataset.reducedMotion = String(state.reducedMotion);
    layer.setAttribute("aria-hidden", String(!state.visible));
    viewport.style.left = effectiveDock === "left"
      ? "var(--avatar-edge-margin)"
      : "calc(100% - var(--avatar-width) - var(--avatar-edge-margin))";
    viewport.style.right = "auto";
    const isSidePlacement = effectivePlacement.endsWith("-side");
    viewport.style.top = isSidePlacement ? "50%" : "auto";
    viewport.style.bottom = isSidePlacement
      ? "auto"
      : "var(--avatar-taskbar-bottom, clamp(3.5rem, 9%, 5rem))";
    viewport.style.transform = isSidePlacement
      ? "translateY(-50%) scale(var(--avatar-presentation-scale, 1))"
      : "scale(var(--avatar-presentation-scale, 1))";
    viewport.style.transformOrigin = isSidePlacement
      ? `${effectiveDock === "left" ? "left" : "right"} center`
      : `${effectiveDock === "left" ? "bottom left" : "bottom right"}`;
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
    const previousPlacement = effectivePlacement;
    updateView();
    if (previousPlacement !== effectivePlacement) notifyChange();
  };

  return {
    get state() {
      const effectiveDock: AvatarDockSide =
        placementSide(effectivePlacement);
      return { ...state, effectiveDock, effectivePlacement };
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
      if (position !== "auto") {
        effectivePlacement =
          position === "left" ? "bottom-left" : "bottom-right";
      }
      updateView();
      notifyChange();
      persistPreferences();
    },

    setImportantRegions(regions) {
      importantRegions = regions.map(copyRegionBounds);
      const previousPlacement = effectivePlacement;
      updateView();
      if (previousPlacement !== effectivePlacement) notifyChange();
    },

    setAvoidRegions(regions) {
      avoidRegions = regions.map(({ rect, importance = 1 }) => {
        if (!Number.isFinite(importance) || importance < 0) {
          throw new RangeError("Attention-region importance must be non-negative.");
        }
        return {
          bounds: copyRegionBounds(rect),
          importance,
        };
      });
      const previousPlacement = effectivePlacement;
      updateView();
      if (previousPlacement !== effectivePlacement) notifyChange();
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
