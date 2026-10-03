import m from "mithril";
import type { Vnode } from "mithril";
import type { AttentionTargetRegistry } from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import { AvatarConversationCard } from "./AvatarConversationCard.js";
import { AvatarViewport } from "./AvatarViewport.js";
import type { AvatarPresentationController } from "./AvatarPresentationController.js";

interface DesktopAvatarOverlayAttrs {
  targetRegistry?: AttentionTargetRegistry;
  onGeometryChange?: () => void;
  onScene?: (scene: AvatarSceneHandle | undefined) => void;
  gazeOverlay?: string;
  showGazeTarget?: boolean;
  frame?: HTMLIFrameElement;
  presentation?: AvatarPresentationController;
}

const TASKBAR_FLOOR_OVERLAP = 3;
const TASKBAR_AVATAR_OCCLUSION_RATIO = 0.5;

export const DesktopAvatarOverlay =
  (): m.Component<DesktopAvatarOverlayAttrs> => {
    let layer: HTMLElement | undefined;
    let frame: HTMLIFrameElement | undefined;
    let outerWindow: Window | undefined;
    let contentWindow: Window | undefined;
    let contentDocument: Document | undefined;
    let frameLoadHandler: (() => void) | undefined;
    let outerResizeObserver: ResizeObserver | undefined;
    let contentResizeObserver: ResizeObserver | undefined;
    let contentMutationObserver: MutationObserver | undefined;
    let windowMutationObserver: MutationObserver | undefined;
    let presentation: AvatarPresentationController | undefined;
    let onGeometryChange: (() => void) | undefined;
    let conversationOpen = false;
    let restoreAvatarFocus = false;

    const updateImportantRegions = () => {
      const document = frame?.contentDocument;
      const innerWindow = frame?.contentWindow;
      if (!presentation || !frame || !document || !innerWindow) {
        onGeometryChange?.();
        return;
      }
      const frameBounds = frame.getBoundingClientRect();
      if (
        !frameBounds.width ||
        !frameBounds.height ||
        !innerWindow.innerWidth ||
        !innerWindow.innerHeight
      ) {
        presentation.setImportantRegions([]);
        onGeometryChange?.();
        return;
      }

      const scaleX = frameBounds.width / innerWindow.innerWidth;
      const scaleY = frameBounds.height / innerWindow.innerHeight;
      const regions: DOMRect[] = [];
      for (const windowElement of document.querySelectorAll<HTMLElement>(
        "#window-layer > .window",
      )) {
        const style = innerWindow.getComputedStyle(windowElement);
        if (
          windowElement.hidden ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          continue;
        }
        const bounds = windowElement.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        regions.push(
          new DOMRect(
            frameBounds.left + bounds.left * scaleX,
            frameBounds.top + bounds.top * scaleY,
            bounds.width * scaleX,
            bounds.height * scaleY,
          ),
        );
      }
      presentation.setImportantRegions(regions);
      onGeometryChange?.();
    };

    const updateGeometry = () => {
      if (!layer || !frame) return;
      const taskbar = frame.contentDocument?.getElementById("taskbar");
      const innerWindow = frame.contentWindow;
      if (!taskbar || !innerWindow) {
        layer.style.removeProperty("--avatar-taskbar-bottom");
        layer.style.removeProperty("--avatar-taskbar-clip-bottom");
        updateImportantRegions();
        return;
      }

      const taskbarBounds = taskbar.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      const layerBounds = layer.getBoundingClientRect();
      const viewportHeight = innerWindow.innerHeight;
      if (!viewportHeight || !frameBounds.height) {
        layer.style.removeProperty("--avatar-taskbar-bottom");
        layer.style.removeProperty("--avatar-taskbar-clip-bottom");
        updateImportantRegions();
        return;
      }

      const taskbarVisible = taskbarBounds.width > 0 && taskbarBounds.height > 0;
      const horizontalTaskbar =
        taskbarVisible && taskbarBounds.width >= taskbarBounds.height;
      const taskbarAtTop = taskbarBounds.top <= viewportHeight / 2;
      const floorOffset = !taskbarVisible
        ? viewportHeight
        : horizontalTaskbar
          ? taskbarAtTop
            ? taskbarBounds.bottom
            : taskbarBounds.top
          : viewportHeight;
      const frameScale = frameBounds.height / viewportHeight;
      const floorY =
        frameBounds.top + floorOffset * frameScale - layerBounds.top;
      const taskbarOccludesAvatar =
        taskbarVisible && horizontalTaskbar && !taskbarAtTop;
      const occlusionDepth = taskbarOccludesAvatar
        ? taskbarBounds.height * frameScale * TASKBAR_AVATAR_OCCLUSION_RATIO
        : 0;
      layer.style.setProperty(
        "--avatar-taskbar-bottom",
        `calc(100% - ${floorY + occlusionDepth + TASKBAR_FLOOR_OVERLAP}px)`,
      );
      if (taskbarOccludesAvatar) {
        layer.style.setProperty(
          "--avatar-taskbar-clip-bottom",
          `${Math.max(0, layerBounds.height - floorY)}px`,
        );
      } else {
        layer.style.removeProperty("--avatar-taskbar-clip-bottom");
      }
      updateImportantRegions();
    };

    const clearContentObservers = () => {
      contentResizeObserver?.disconnect();
      contentResizeObserver = undefined;
      contentMutationObserver?.disconnect();
      contentMutationObserver = undefined;
      windowMutationObserver?.disconnect();
      windowMutationObserver = undefined;
      contentWindow?.removeEventListener("resize", updateGeometry);
      contentWindow?.removeEventListener("scroll", updateGeometry);
      contentDocument?.removeEventListener("scroll", updateGeometry, true);
      contentWindow = undefined;
      contentDocument = undefined;
    };

    const observeImportantWindows = () => {
      windowMutationObserver?.disconnect();
      const document = frame?.contentDocument;
      const windowLayer = document?.getElementById("window-layer");
      if (!windowLayer || typeof MutationObserver === "undefined") {
        updateImportantRegions();
        return;
      }

      windowMutationObserver = new MutationObserver(() => {
        observeImportantWindows();
      });
      windowMutationObserver.observe(windowLayer, { childList: true });
      for (const windowElement of windowLayer.children) {
        windowMutationObserver.observe(windowElement, {
          attributes: true,
          attributeFilter: ["class", "style", "hidden"],
        });
      }
      updateImportantRegions();
    };

    const observeTaskbar = () => {
      clearContentObservers();
      const document = frame?.contentDocument;
      const taskbar = document?.getElementById("taskbar");
      const innerWindow = frame?.contentWindow;
      if (!taskbar || !innerWindow) {
        updateGeometry();
        return;
      }

      contentWindow = innerWindow;
      contentDocument = document ?? undefined;
      innerWindow.addEventListener("resize", updateGeometry);
      innerWindow.addEventListener("scroll", updateGeometry);
      document?.addEventListener("scroll", updateGeometry, true);
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateGeometry);
        observer.observe(taskbar);
        contentResizeObserver = observer;
      }
      if (typeof MutationObserver !== "undefined" && document?.body) {
        const observer = new MutationObserver(updateGeometry);
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ["class", "style", "data-dock-position"],
        });
        observer.observe(taskbar, {
          attributes: true,
          attributeFilter: ["class", "style"],
        });
        contentMutationObserver = observer;
      }
      observeImportantWindows();
      updateGeometry();
    };

    const setFrame = (nextFrame: HTMLIFrameElement | undefined) => {
      if (frame === nextFrame) {
        updateGeometry();
        return;
      }

      clearContentObservers();
      outerResizeObserver?.disconnect();
      outerResizeObserver = undefined;
      outerWindow?.removeEventListener("resize", updateGeometry);
      outerWindow?.removeEventListener("scroll", updateGeometry);
      outerWindow = undefined;
      if (frame && frameLoadHandler) {
        frame.removeEventListener("load", frameLoadHandler);
      }
      frame = nextFrame;
      frameLoadHandler = undefined;

      if (!frame || !layer) {
        layer?.style.removeProperty("--avatar-taskbar-bottom");
        layer?.style.removeProperty("--avatar-taskbar-clip-bottom");
        return;
      }

      outerWindow = frame.ownerDocument.defaultView ?? undefined;
      outerWindow?.addEventListener("resize", updateGeometry);
      outerWindow?.addEventListener("scroll", updateGeometry);
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateGeometry);
        observer.observe(frame);
        observer.observe(layer);
        outerResizeObserver = observer;
      }
      frameLoadHandler = observeTaskbar;
      frame.addEventListener("load", frameLoadHandler);
      observeTaskbar();
    };

    const setPresentation = (
      nextPresentation: AvatarPresentationController | undefined,
    ) => {
      if (presentation === nextPresentation) return;
      presentation?.detach();
      presentation = nextPresentation;
      if (!presentation || !layer) return;
      const viewport = layer.querySelector<HTMLElement>(".avatar-viewport");
      if (!viewport) {
        throw new Error("The desktop avatar viewport is unavailable.");
      }
      presentation.attach(layer, viewport);
      updateGeometry();
    };

    return {
      oncreate(vnode) {
        layer = vnode.dom as HTMLElement;
        onGeometryChange = vnode.attrs.onGeometryChange;
        setFrame(vnode.attrs.frame);
        setPresentation(vnode.attrs.presentation);
      },

      onupdate(vnode) {
        onGeometryChange = vnode.attrs.onGeometryChange;
        setFrame(vnode.attrs.frame);
        setPresentation(vnode.attrs.presentation);
        if (restoreAvatarFocus && !conversationOpen) {
          restoreAvatarFocus = false;
          layer
            ?.querySelector<HTMLButtonElement>(".avatar-interaction-target")
            ?.focus();
        }
      },

      onremove() {
        if (conversationOpen) presentation?.setMode("ambient");
        conversationOpen = false;
        setPresentation(undefined);
        setFrame(undefined);
        layer = undefined;
        onGeometryChange = undefined;
      },

      view(vnode: Vnode<DesktopAvatarOverlayAttrs>) {
        const viewportAttrs = {
          targetRegistry: vnode.attrs.targetRegistry,
          onScene: vnode.attrs.onScene,
          gazeOverlay: vnode.attrs.gazeOverlay,
          showGazeTarget: vnode.attrs.showGazeTarget,
          interactive: true,
          conversationOpen,
          onActivate() {
            conversationOpen = true;
            presentation?.setMode("conversation");
            m.redraw();
          },
        };
        return m(
          ".desktop-avatar-layer",
          {
            role: "group",
            "aria-label": "Desktop companion",
          },
          [
            m(AvatarViewport, viewportAttrs),
            conversationOpen
              ? m(AvatarConversationCard, {
                  onClose() {
                    conversationOpen = false;
                    restoreAvatarFocus = true;
                    presentation?.setMode("ambient");
                    m.redraw();
                  },
                })
              : null,
          ],
        );
      },
    };
  };
