import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import type { AvatarUiTargetRegistry } from "@sodalis/avatar";
import { DEFAULT_AVATAR_ASSET } from "./defaultAvatar.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface AvatarViewportAttrs {
  targetRegistry?: AvatarUiTargetRegistry;
  onScene?: (scene: AvatarSceneHandle | undefined) => void;
  gazeOverlay?: string;
  showGazeTarget?: boolean;
}

export const AvatarViewport = (): m.Component<AvatarViewportAttrs> => {
  let scene: AvatarSceneHandle | undefined;
  let status = "Preparing the avatar viewer…";
  let removed = false;
  let initializing = false;
  let generation = 0;
  let canvas: HTMLCanvasElement | undefined;

  const initialize = async (attrs: AvatarViewportAttrs) => {
    if (initializing || removed) return;
    initializing = true;
    const attempt = ++generation;
    status = `Preparing the ${DEFAULT_AVATAR_ASSET.name} avatar viewer…`;
    scene?.dispose();
    scene = undefined;
    attrs.onScene?.(undefined);
    m.redraw();

    try {
      const { createAvatarScene } = await import("@sodalis/avatar/internal/scene");
      if (removed || attempt !== generation) return;
      if (!canvas) throw new Error("The avatar canvas could not be created.");
      scene = createAvatarScene(canvas, {
        ...(attrs.targetRegistry
          ? { targetRegistry: attrs.targetRegistry }
          : {}),
        onError(error) {
          if (removed || attempt !== generation) return;
          status = `3D avatar unavailable: ${error.message}`;
          m.redraw();
        },
        onFpsChange() {
          if (!removed && attempt === generation) m.redraw();
        },
      });
      attrs.onScene?.(scene);
      status = `Loading ${DEFAULT_AVATAR_ASSET.name} avatar…`;
      m.redraw();
      await scene.controller.load(DEFAULT_AVATAR_ASSET);
      if (removed || attempt !== generation) return;
      status = `${DEFAULT_AVATAR_ASSET.name} avatar ready.`;
    } catch (error) {
      if (removed || attempt !== generation) return;
      status = `3D avatar unavailable: ${errorMessage(error)}`;
    } finally {
      initializing = false;
      if (!removed) m.redraw();
    }
  };

  return {
    oncreate(vnode: VnodeDOM<AvatarViewportAttrs>) {
      const element = vnode.dom.querySelector("canvas");
      if (!(element instanceof HTMLCanvasElement)) {
        status = "The avatar canvas could not be created.";
        m.redraw();
        return;
      }
      canvas = element;
      void initialize(vnode.attrs);
    },

    onremove(vnode: VnodeDOM<AvatarViewportAttrs>) {
      removed = true;
      generation += 1;
      scene?.dispose();
      scene = undefined;
      vnode.attrs.onScene?.(undefined);
    },

    view(vnode: Vnode<AvatarViewportAttrs>) {
      return m(
        ".avatar-viewport",
        {
          role: "group",
          "aria-label": "Avatar viewer",
        },
        [
          m("canvas.avatar-canvas[aria-hidden=true]"),
          import.meta.env.DEV && vnode.attrs.showGazeTarget
            ? m(
                "output.avatar-gaze-overlay[aria-live=polite]",
                vnode.attrs.gazeOverlay ?? "Gaze target: User",
              )
            : null,
          m(
            "p.avatar-viewport-status[role=status][aria-live=polite]",
            {
              class:
                status === `${DEFAULT_AVATAR_ASSET.name} avatar ready.`
                  ? "avatar-viewport-status-ready"
                  : "",
            },
            status,
          ),
          status.startsWith("3D avatar unavailable")
            ? m(
                "button[type=button].avatar-viewport-retry",
                { onclick: () => void initialize(vnode.attrs) },
                "Retry avatar",
              )
            : null,
        ],
      );
    },
  };
};
