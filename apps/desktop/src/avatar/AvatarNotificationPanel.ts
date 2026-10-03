import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import { positionAvatarCompanionCard } from "./AvatarCompanionCardPosition.js";
import type { AvatarDockSide } from "./AvatarPresentationController.js";

export type AvatarNotificationAction = "read" | "open" | "dismiss";

export interface AvatarNotification {
  id: string;
  source: string;
  sourceLabel: string;
  type: string;
  title: string;
  summary: string;
  appId: string;
  appTitle: string;
  actions: readonly AvatarNotificationAction[];
  read: boolean;
}

interface AvatarNotificationPanelAttrs {
  notifications: readonly AvatarNotification[];
  openError?: string;
  onClose: () => void;
  onRead: (notification: AvatarNotification) => void;
  onOpen: (notification: AvatarNotification) => void;
  onDismiss: (notification: AvatarNotification) => void;
}

export const AvatarNotificationPanel =
  (): m.Component<AvatarNotificationPanelAttrs> => {
    let panel: HTMLElement | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const updatePosition = () => {
      if (!panel) return;
      const layer = panel.closest<HTMLElement>(".desktop-avatar-layer");
      const avatar = layer?.querySelector<HTMLElement>(".avatar-viewport");
      if (!layer || !avatar) return;
      const layerBounds = layer.getBoundingClientRect();
      const avatarBounds = avatar.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      if (!layerBounds.width || !layerBounds.height || !panelBounds.width) return;

      const clipBottom = Number.parseFloat(
        layer.style.getPropertyValue("--avatar-taskbar-clip-bottom"),
      );
      const usableLayer = new DOMRect(
        layerBounds.left,
        layerBounds.top,
        layerBounds.width,
        Math.max(
          0,
          layerBounds.height -
            (Number.isFinite(clipBottom) ? clipBottom : 0),
        ),
      );
      const dock = layer.dataset.effectiveDock === "left" ? "left" : "right";
      const position = positionAvatarCompanionCard(
        usableLayer,
        avatarBounds,
        { width: panelBounds.width, height: Math.max(panelBounds.height, panel.scrollHeight + 2) },
        dock,
      );
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      panel.style.maxHeight = `${position.maxHeight}px`;
    };

    return {
      oncreate(vnode: VnodeDOM<AvatarNotificationPanelAttrs>) {
        panel = vnode.dom as HTMLElement;
        updatePosition();
        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(updatePosition);
          resizeObserver.observe(panel);
          const layer = panel.closest<HTMLElement>(".desktop-avatar-layer");
          const avatar = layer?.querySelector<HTMLElement>(".avatar-viewport");
          if (layer) resizeObserver.observe(layer);
          if (avatar) resizeObserver.observe(avatar);
        }
      },

      onupdate() {
        updatePosition();
      },

      onremove() {
        resizeObserver?.disconnect();
        resizeObserver = undefined;
        panel = undefined;
      },

      view(vnode: Vnode<AvatarNotificationPanelAttrs>) {
        const renderAction = (
          notification: AvatarNotification,
          action: AvatarNotificationAction,
        ) => {
          if (action === "read") {
            return m(
              "button[type=button]",
              {
                class: "avatar-notification-action",
                "aria-label": notification.read
                  ? `${notification.title} is read`
                  : `Mark ${notification.title} as read`,
                disabled: notification.read,
                onclick: () => vnode.attrs.onRead(notification),
              },
              "Read",
            );
          }
          if (action === "open") {
            return m(
              "button[type=button]",
              {
                class: "avatar-notification-action",
                "aria-label": `Open ${notification.appTitle}`,
                onclick: () => vnode.attrs.onOpen(notification),
              },
              "Open",
            );
          }
          return m(
            "button[type=button]",
            {
              class: "avatar-notification-action",
              "aria-label": `Dismiss ${notification.title}`,
              onclick: () => vnode.attrs.onDismiss(notification),
            },
            "Dismiss",
          );
        };

        return m(
          "section#avatar-notification-summary.avatar-notification-summary[role=region][aria-labelledby=avatar-notification-title]",
          [
            m("header.avatar-notification-header", [
              m("h2#avatar-notification-title", "Notifications"),
              m(
                "button[type=button]",
                {
                  class: "avatar-notification-close",
                  "aria-label": "Close notifications",
                  onclick: vnode.attrs.onClose,
                },
                "Close",
              ),
            ]),
            m("p.avatar-notification-policy", "Notifications stay silent by default."),
            m(
              "ul.avatar-notification-list",
              vnode.attrs.notifications.map((notification) =>
                m(
                  "li.avatar-notification-item",
                  { key: notification.id },
                  [
                    m(
                      "p.avatar-notification-source",
                      `${notification.sourceLabel} · ${notification.type}`,
                    ),
                    m("h3", notification.title),
                    m("p.avatar-notification-copy", notification.summary),
                    m(
                      "div.avatar-notification-actions",
                      notification.actions.map((action) =>
                        renderAction(notification, action),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            vnode.attrs.openError
              ? m(
                  "p.avatar-notification-error[role=alert]",
                  vnode.attrs.openError,
                )
              : null,
          ],
        );
      },
    };
  };
