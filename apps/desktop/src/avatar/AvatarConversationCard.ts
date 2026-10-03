import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import type { AvatarDockSide } from "./AvatarPresentationController.js";

export interface AvatarConversationCardPosition {
  left: number;
  top: number;
  maxHeight: number;
}

const CARD_GAP = 12;
const CARD_PADDING = 6;
const FACE_HEIGHT_RATIO = 0.35;

function overlaps(
  first: { left: number; top: number; width: number; height: number },
  second: { left: number; top: number; width: number; height: number },
): boolean {
  return (
    first.left < second.left + second.width &&
    first.left + first.width > second.left &&
    first.top < second.top + second.height &&
    first.top + first.height > second.top
  );
}

export function positionAvatarConversationCard(
  layer: DOMRectReadOnly,
  avatar: DOMRectReadOnly,
  card: Pick<DOMRectReadOnly, "width" | "height">,
  dock: AvatarDockSide,
): AvatarConversationCardPosition {
  const width = Math.min(card.width, Math.max(0, layer.width - CARD_PADDING * 2));
  const maximumHeight = Math.min(layer.height * 0.72, 432);
  const avatarBounds = {
    left: avatar.left - layer.left,
    top: avatar.top - layer.top,
    width: avatar.width,
    height: avatar.height,
  };
  const sideCandidates =
    dock === "right"
      ? [
          avatarBounds.left - width - CARD_GAP,
          avatarBounds.left + avatarBounds.width + CARD_GAP,
        ]
      : [
          avatarBounds.left + avatarBounds.width + CARD_GAP,
          avatarBounds.left - width - CARD_GAP,
        ];

  const sideBottom = Math.min(
    avatarBounds.top + avatarBounds.height,
    layer.height - CARD_PADDING,
  );
  for (const left of sideCandidates) {
    const height = Math.min(card.height, maximumHeight, sideBottom - CARD_PADDING);
    const top = sideBottom - height;
    if (
      left >= CARD_PADDING &&
      left + width <= layer.width - CARD_PADDING &&
      height > 0 &&
      !overlaps({ left, top, width, height }, avatarBounds)
    ) {
      return { left, top, maxHeight: height };
    }
  }

  const verticalCandidates = [
    {
      left: avatarBounds.left + avatarBounds.width - width,
      bottom: avatarBounds.top - CARD_GAP,
    },
    {
      left: avatarBounds.left + avatarBounds.width - width,
      top: avatarBounds.top + avatarBounds.height + CARD_GAP,
    },
  ];
  for (const candidate of verticalCandidates) {
    const availableHeight =
      candidate.bottom !== undefined
        ? candidate.bottom - CARD_PADDING
        : layer.height - CARD_PADDING - candidate.top;
    const height = Math.min(card.height, maximumHeight, availableHeight);
    const top =
      candidate.bottom !== undefined
        ? candidate.bottom - height
        : candidate.top;
    if (
      candidate.left >= CARD_PADDING &&
      candidate.left + width <= layer.width - CARD_PADDING &&
      top >= CARD_PADDING &&
      height > 0 &&
      !overlaps({ left: candidate.left, top, width, height }, avatarBounds)
    ) {
      return {
        left: candidate.left,
        top,
        maxHeight: height,
      };
    }
  }

  const faceBottom =
    avatarBounds.top + avatarBounds.height * FACE_HEIGHT_RATIO;
  const top = Math.min(
    Math.max(CARD_PADDING, faceBottom + CARD_GAP),
    Math.max(CARD_PADDING, layer.height - CARD_PADDING - 80),
  );
  const preferredLeft =
    dock === "right"
      ? avatarBounds.left - width - CARD_GAP
      : avatarBounds.left + avatarBounds.width + CARD_GAP;
  return {
    left: Math.max(
      CARD_PADDING,
      Math.min(preferredLeft, layer.width - width - CARD_PADDING),
    ),
    top,
    maxHeight: Math.max(80, layer.height - top - CARD_PADDING),
  };
}

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
      const position = positionAvatarConversationCard(
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
