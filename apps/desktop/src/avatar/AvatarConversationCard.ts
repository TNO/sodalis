import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import { positionAvatarCompanionCard } from "./AvatarCompanionCardPosition.js";

interface AvatarConversationCardAttrs {
  onClose: () => void;
}

export const AvatarConversationCard =
  (): m.Component<AvatarConversationCardAttrs> => {
    let card: HTMLElement | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let listening = true;
    let draft = "";
    let transcript = "How do I reply to this email?";
    let caption = "Select Reply in the message toolbar. I can highlight it for you.";

    const updatePosition = () => {
      if (!card) return;
      const layer = card.closest<HTMLElement>(".desktop-avatar-layer");
      const avatar = layer?.querySelector<HTMLElement>(".avatar-viewport");
      if (!layer || !avatar) return;
      const layerBounds = layer.getBoundingClientRect();
      const avatarBounds = avatar.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      if (!layerBounds.width || !layerBounds.height || !cardBounds.width) return;
      const naturalHeight = Math.max(cardBounds.height, card.scrollHeight + 2);

      const dock = layer.dataset.effectiveDock === "left" ? "left" : "right";
      const clipBottom = Number.parseFloat(
        layer.style.getPropertyValue("--avatar-taskbar-clip-bottom"),
      );
      const usableLayer = new DOMRect(
        layerBounds.left,
        layerBounds.top,
        layerBounds.width,
        Math.max(0, layerBounds.height - (Number.isFinite(clipBottom) ? clipBottom : 0)),
      );
      const position = positionAvatarCompanionCard(
        usableLayer,
        avatarBounds,
        { width: cardBounds.width, height: naturalHeight },
        dock,
      );
      card.style.left = `${position.left}px`;
      card.style.top = `${position.top}px`;
      card.style.maxHeight = `${position.maxHeight}px`;
    };

    return {
      oncreate(vnode: VnodeDOM<AvatarConversationCardAttrs>) {
        card = vnode.dom as HTMLElement;
        updatePosition();
        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(updatePosition);
          resizeObserver.observe(card);
          const layer = card.closest<HTMLElement>(".desktop-avatar-layer");
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
        card = undefined;
      },

      view(vnode: Vnode<AvatarConversationCardAttrs>) {
        const sendMessage = (event: SubmitEvent) => {
          event.preventDefault();
          const message = draft.trim();
          if (!message) return;
          transcript = message;
          caption =
            "Thanks for telling me. Live assistant replies are not connected yet.";
          draft = "";
        };

        return m(
          "section#avatar-conversation-card.avatar-conversation-card[role=region][aria-labelledby=avatar-conversation-title]",
          [
            m("header.avatar-conversation-header", [
              m("h2#avatar-conversation-title", "Talk with Sodalis"),
              m(
                "button.avatar-conversation-close[type=button]",
                {
                  "aria-label": "Close conversation",
                  onclick: vnode.attrs.onClose,
                },
                "Close",
              ),
            ]),
            m("div.avatar-conversation-transcript[aria-live=polite][aria-atomic=true]", [
              m("p.avatar-conversation-speaker", "You"),
              m("p.avatar-conversation-user-text", transcript),
              m("p.avatar-conversation-speaker", "Sodalis"),
              m("p.avatar-conversation-caption", caption),
            ]),
            m(
              "p.avatar-conversation-status[role=status][aria-live=polite]",
              listening
                ? "Demo listening is active. No microphone is connected."
                : "Demo listening is stopped. You can type a message instead.",
            ),
            m(
              "button.avatar-conversation-listening[type=button]",
              {
                onclick: () => {
                  listening = !listening;
                },
              },
              listening ? "Stop demo listening" : "Resume demo listening",
            ),
            m(
              "form.avatar-conversation-form",
              { onsubmit: sendMessage },
              [
                m("label.avatar-conversation-input-label", {
                  for: "avatar-conversation-input",
                }, "Or type a message"),
                m("div.avatar-conversation-input-row", [
                  m("input#avatar-conversation-input[type=text]", {
                    value: draft,
                    placeholder: "Type a message",
                    autocomplete: "off",
                    oninput: (event: Event) => {
                      draft = (event.currentTarget as HTMLInputElement).value;
                    },
                  }),
                  m("button[type=submit]", {
                    disabled: !draft.trim(),
                  }, "Send"),
                ]),
              ],
            ),
          ],
        );
      },
    };
  };
