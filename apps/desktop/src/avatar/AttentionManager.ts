import type {
  AttentionTarget,
  AttentionTargetRegistry,
  AttentionTargetRegistration,
  AvatarController,
} from "@sodalis/avatar";
import type {
  AvatarAvoidRegion,
  AvatarPresentationController,
} from "./AvatarPresentationController.js";

export interface AttentionFocusOptions {
  highlight?: boolean;
  gaze?: boolean;
  avoid?: boolean;
}

export interface AttentionManager {
  register(target: AttentionTargetRegistration): () => void;
  resolve(id: string): AttentionTarget | undefined;
  listTargets(): AttentionTarget[];
  focus(id: string, options?: AttentionFocusOptions): void;
  clear(): void;
  refresh(): void;
  attach(host: HTMLElement): void;
  detach(): void;
}

interface AttentionManagerOptions {
  registry: AttentionTargetRegistry;
  presentation: AvatarPresentationController;
  getAvatarController: () => AvatarController | undefined;
}

interface FocusedTarget {
  id: string;
  highlight: boolean;
  gaze: boolean;
  avoid: boolean;
}

function importanceWeight(target: AttentionTarget): number {
  switch (target.importance) {
    case "low":
      return 0.5;
    case "high":
      return 1.5;
    case "normal":
      return 1;
  }
}

function sameRect(
  first: DOMRectReadOnly | undefined,
  second: DOMRectReadOnly,
): boolean {
  return (
    first?.left === second.left &&
    first.top === second.top &&
    first.width === second.width &&
    first.height === second.height
  );
}

export function createAttentionManager(
  options: AttentionManagerOptions,
): AttentionManager {
  let host: HTMLElement | undefined;
  let highlight: HTMLDivElement | undefined;
  let focused: FocusedTarget | undefined;
  let lastGazeRect: DOMRectReadOnly | undefined;
  let appliedGazeId: string | undefined;

  const resolveFocused = (): AttentionTarget | undefined => {
    if (!focused) return undefined;
    return options.registry.resolve(focused.id);
  };

  const updateHighlight = (target: AttentionTarget | undefined) => {
    if (!highlight) return;
    if (!focused?.highlight || !target?.visible || !target.rect) {
      highlight.hidden = true;
      return;
    }
    highlight.hidden = false;
    highlight.dataset.targetId = target.id;
    highlight.dataset.reducedMotion = String(
      options.presentation.state.reducedMotion,
    );
    highlight.style.left = `${target.rect.left}px`;
    highlight.style.top = `${target.rect.top}px`;
    highlight.style.width = `${target.rect.width}px`;
    highlight.style.height = `${target.rect.height}px`;
  };

  const updateGuidance = (target: AttentionTarget) => {
    if (!focused || !target.visible || !target.rect) return;
    const regions: AvatarAvoidRegion[] =
      focused.avoid
        ? [{ rect: target.rect, importance: importanceWeight(target) }]
        : [];
    options.presentation.setAvoidRegions(regions);
    if (focused.gaze && !sameRect(lastGazeRect, target.rect)) {
      const controller = options.getAvatarController();
      if (controller) {
        controller.lookAt({ type: "ui-element", id: target.id });
        appliedGazeId = target.id;
        lastGazeRect = target.rect;
      }
    }
  };

  const clear = () => {
    const previous = focused;
    focused = undefined;
    lastGazeRect = undefined;
    if (highlight) highlight.hidden = true;
    if (previous?.avoid) options.presentation.setAvoidRegions([]);
    if (appliedGazeId) {
      options.getAvatarController()?.lookAt({ type: "user" });
    }
    appliedGazeId = undefined;
  };

  const refresh = () => {
    const target = resolveFocused();
    if (!target?.visible || !target.rect) {
      if (focused) clear();
      return;
    }
    updateHighlight(target);
    updateGuidance(target);
  };

  const detach = () => {
    clear();
    highlight?.remove();
    highlight = undefined;
    host = undefined;
  };

  return {
    register(target) {
      return options.registry.register(target);
    },

    resolve(id) {
      return options.registry.resolve(id);
    },

    listTargets() {
      return options.registry.list().filter((target) => target.visible);
    },

    focus(id, focusOptions = {}) {
      const target = options.registry.resolve(id);
      if (!target?.visible || !target.rect) {
        throw new Error(`Attention target "${id}" is not visible or registered.`);
      }

      const next: FocusedTarget = {
        id,
        highlight: focusOptions.highlight ?? true,
        gaze: focusOptions.gaze ?? true,
        avoid: focusOptions.avoid ?? true,
      };
      if (appliedGazeId && !next.gaze) {
        options.getAvatarController()?.lookAt({ type: "user" });
        appliedGazeId = undefined;
      }
      if (focused?.id !== id || focused.gaze !== next.gaze) {
        lastGazeRect = undefined;
      }
      focused = next;
      updateHighlight(target);
      updateGuidance(target);
    },

    clear,

    refresh,

    attach(nextHost) {
      if (host === nextHost && highlight?.isConnected) return;
      detach();
      host = nextHost;
      highlight = host.ownerDocument.createElement("div");
      highlight.className = "attention-highlight";
      highlight.hidden = true;
      highlight.setAttribute("aria-hidden", "true");
      host.append(highlight);
      refresh();
    },

    detach,
  };
}
