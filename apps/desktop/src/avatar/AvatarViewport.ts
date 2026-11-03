import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import type { AttentionTargetRegistry } from "@sodalis/avatar";
import { isDotsAsset, type CompanionAsset } from "./avatarCatalogue.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface AvatarSwitchOption {
  name: string;
  select: () => void;
}

export interface AvatarViewportAttrs {
  asset: CompanionAsset;
  activity?: "idle" | "listening" | "thinking" | "speaking" | "error";
  reducedMotion?: boolean;
  /** Offered alongside Retry when the selected avatar cannot be shown. */
  switchTo?: AvatarSwitchOption;
  targetRegistry?: AttentionTargetRegistry;
  onScene?: (scene: AvatarSceneHandle | undefined) => void;
  gazeOverlay?: string;
  showGazeTarget?: boolean;
  interactive?: boolean;
  conversationOpen?: boolean;
  notificationCount?: number;
  notificationOpen?: boolean;
  onActivate?: () => void;
  onNotificationsActivate?: () => void;
}

export const AvatarViewport = (): m.Component<AvatarViewportAttrs> => {
  let scene: AvatarSceneHandle | undefined;
  let status = "Preparing the avatar viewer…";
  let removed = false;
  let initializing = false;
  let generation = 0;
  let canvas: HTMLCanvasElement | undefined;
  let loadedAssetId: string | undefined;
  let ready = false;

  // A changed selection supersedes any load in progress; retries do not stack.
  const initialize = async (attrs: AvatarViewportAttrs, supersede = false) => {
    if ((initializing && !supersede) || removed) return;
    initializing = true;
    const attempt = ++generation;
    const asset = attrs.asset;
    loadedAssetId = asset.id;
    ready = false;
    status = `Preparing the ${asset.name} avatar viewer…`;
    scene?.dispose();
    scene = undefined;
    attrs.onScene?.(undefined);
    m.redraw();

    try {
      if (isDotsAsset(asset)) {
        ready = true;
        status = "Three dots ready.";
        return;
      }
      const { createAvatarScene } = await import("@sodalis/avatar/internal/scene");
      if (removed || attempt !== generation) return;
      if (!canvas) throw new Error("The avatar canvas could not be created.");
      scene = createAvatarScene(canvas, {
        ...(attrs.targetRegistry
          ? { targetRegistry: attrs.targetRegistry }
          : {}),
        onError(error) {
          if (removed || attempt !== generation) return;
          ready = false;
          status = `3D avatar unavailable: ${error.message}`;
          m.redraw();
        },
        onFpsChange() {
          if (!removed && attempt === generation) m.redraw();
        },
      });
      attrs.onScene?.(scene);
      status = `Loading ${asset.name} avatar…`;
      m.redraw();
      await scene.controller.load(asset);
      if (removed || attempt !== generation) return;
      ready = true;
      status = `${asset.name} avatar ready.`;
    } catch (error) {
      if (removed || attempt !== generation) return;
      status = `3D avatar unavailable: ${errorMessage(error)}`;
    } finally {
      if (attempt === generation) initializing = false;
      if (!removed) m.redraw();
    }
  };

  return {
    oncreate(vnode: VnodeDOM<AvatarViewportAttrs>) {
      const element = vnode.dom.querySelector("canvas");
      if (!isDotsAsset(vnode.attrs.asset) && !(element instanceof HTMLCanvasElement)) {
        status = "The avatar canvas could not be created.";
        m.redraw();
        return;
      }
      canvas = element instanceof HTMLCanvasElement ? element : undefined;
      void initialize(vnode.attrs);
    },

    onupdate(vnode: VnodeDOM<AvatarViewportAttrs>) {
      const element = vnode.dom.querySelector("canvas");
      canvas = element instanceof HTMLCanvasElement ? element : undefined;
      if (vnode.attrs.asset.id !== loadedAssetId) {
        void initialize(vnode.attrs, true);
      }
    },

    onremove(vnode: VnodeDOM<AvatarViewportAttrs>) {
      removed = true;
      generation += 1;
      scene?.dispose();
      scene = undefined;
      vnode.attrs.onScene?.(undefined);
    },

    view(vnode: Vnode<AvatarViewportAttrs>) {
      const dots = isDotsAsset(vnode.attrs.asset);
      const activity = vnode.attrs.activity ?? "idle";
      const activityLabel = {
        idle: "Ready",
        listening: "Listening",
        thinking: "Thinking",
        speaking: "Speaking",
        error: "Needs attention",
      }[activity];
      return m(
        ".avatar-viewport",
        {
          role: "group",
          "aria-label": "Avatar viewer",
          "data-presentation": dots ? "dots" : "human",
          "data-activity": activity,
          "data-reduced-motion": String(vnode.attrs.reducedMotion ?? false),
        },
        [
          dots
            ? m(".avatar-dots[aria-hidden=true]", [m("span"), m("span"), m("span")])
            : m("canvas.avatar-canvas[aria-hidden=true]"),
          dots ? m("p.avatar-dots-label[role=status][aria-live=polite]", activityLabel) : null,
          import.meta.env.DEV && vnode.attrs.showGazeTarget
            ? m(
                "output.avatar-gaze-overlay[aria-live=polite]",
                vnode.attrs.gazeOverlay ?? "Gaze target: User",
              )
            : null,
          vnode.attrs.interactive &&
          vnode.attrs.onActivate &&
          ready
            ? m(
                "button.avatar-interaction-target[type=button]",
                {
                  "aria-label": "Start a conversation with Sodalis",
                  "aria-expanded": String(vnode.attrs.conversationOpen ?? false),
                  ...(vnode.attrs.conversationOpen
                    ? { "aria-controls": "avatar-conversation-card" }
                    : {}),
                  onclick: vnode.attrs.onActivate,
                },
              )
            : null,
          vnode.attrs.notificationCount &&
          vnode.attrs.notificationCount > 0 &&
          vnode.attrs.onNotificationsActivate &&
          ready
              ? m(
                  "button.avatar-notification-indicator[type=button]",
                  {
                    "aria-label": `${vnode.attrs.notificationOpen ? "Hide" : "Show"} ${
                      vnode.attrs.notificationCount
                    } ${
                      vnode.attrs.notificationCount === 1
                        ? "notification"
                        : "notifications"
                    }`,
                    "aria-expanded": String(vnode.attrs.notificationOpen ?? false),
                    ...(vnode.attrs.notificationOpen
                      ? { "aria-controls": "avatar-notification-summary" }
                      : {}),
                    onclick: vnode.attrs.onNotificationsActivate,
                  },
                  [
                    m("span.avatar-notification-dot[aria-hidden=true]"),
                    String(vnode.attrs.notificationCount),
                  ],
                )
              : null,
          m(
            "p.avatar-viewport-status[role=status][aria-live=polite]",
            {
              class:
                ready
                  ? "avatar-viewport-status-ready"
                  : "",
            },
            status,
          ),
          status.startsWith("3D avatar unavailable")
            ? m(".avatar-viewport-recovery", [
                m(
                  "button[type=button].avatar-viewport-retry",
                  { onclick: () => void initialize(vnode.attrs) },
                  "Retry avatar",
                ),
                vnode.attrs.switchTo
                  ? m(
                      "button[type=button].avatar-viewport-retry",
                      { onclick: vnode.attrs.switchTo.select },
                      `Switch to ${vnode.attrs.switchTo.name}`,
                    )
                  : null,
              ])
            : null,
        ],
      );
    },
  };
};
