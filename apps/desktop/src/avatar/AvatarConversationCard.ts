import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import type { SpeechInputController } from "@sodalis/speech";
import { positionAvatarCompanionCard } from "./AvatarCompanionCardPosition.js";

interface AvatarConversationCardAttrs {
  speechInput?: SpeechInputController;
  speechActivityMessage?: string;
  speechError?: string;
  userTranscript?: string;
  assistantText?: string;
  onSpeechError?: (error: Error) => void;
  onClose: () => void;
}

export const AvatarConversationCard =
  (): m.Component<AvatarConversationCardAttrs> => {
    let card: HTMLElement | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let draft = "";
    let transcript = "How do I reply to this email?";
    let caption = "Select Reply in the message toolbar. I can highlight it for you.";
    let actionError: string | undefined;
    let pushToTalkActive = false;

    const handleActionError = (
      error: unknown,
      attrs: AvatarConversationCardAttrs,
    ) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      actionError = normalized.message;
      attrs.onSpeechError?.(normalized);
      m.redraw();
    };

    const runInputAction = (
      action: (() => Promise<void>) | undefined,
      attrs: AvatarConversationCardAttrs,
    ) => {
      if (!action) {
        handleActionError(new Error("Microphone input is unavailable."), attrs);
        return;
      }
      actionError = undefined;
      void action().catch((error: unknown) => handleActionError(error, attrs));
    };

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
        const speechInput = vnode.attrs.speechInput;
        const speechState = speechInput?.state;
        const requestingPermission =
          speechState?.status === "requesting-permission";
        const listening = speechState?.status === "listening";
        const statusMessage =
          vnode.attrs.speechError
            ? `Microphone error: ${vnode.attrs.speechError}`
            : speechState?.status === "error"
              ? `Microphone unavailable: ${speechState.error ?? "Unknown error."}`
              : actionError
                ? `Microphone error: ${actionError}`
              : requestingPermission
                ? "Requesting microphone permission…"
                : listening
                  ? vnode.attrs.speechActivityMessage ??
                    "Microphone is on. Speak to start a turn."
                  : "Microphone is off. Hold to talk or type a message.";

        const startPushToTalk = () => {
          if (pushToTalkActive || requestingPermission) return;
          pushToTalkActive = true;
          runInputAction(
            speechInput ? () => speechInput.start() : undefined,
            vnode.attrs,
          );
        };
        const stopPushToTalk = () => {
          if (!pushToTalkActive) return;
          pushToTalkActive = false;
          runInputAction(
            speechInput ? () => speechInput.stop() : undefined,
            vnode.attrs,
          );
        };

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
              m(
                "p.avatar-conversation-user-text",
                vnode.attrs.userTranscript ?? transcript,
              ),
              m("p.avatar-conversation-speaker", "Sodalis"),
              m(
                "p.avatar-conversation-caption",
                vnode.attrs.assistantText ?? caption,
              ),
            ]),
            m(
              "p.avatar-conversation-status[role=status][aria-live=polite]",
              statusMessage,
            ),
            m(
              "button.avatar-conversation-listening[type=button]",
              {
                disabled: requestingPermission,
                onclick: () => {
                  runInputAction(
                    speechInput
                      ? listening
                        ? () => speechInput.stop()
                        : () => speechInput.start()
                      : undefined,
                    vnode.attrs,
                  );
                },
              },
              listening ? "Stop listening" : "Start microphone",
            ),
            m(
              "button.avatar-conversation-push-to-talk[type=button]",
              {
                disabled: requestingPermission,
                "aria-pressed": String(pushToTalkActive),
                onpointerdown: (event: PointerEvent) => {
                  event.preventDefault();
                  const button = event.currentTarget as HTMLButtonElement;
                  if (typeof button.setPointerCapture === "function") {
                    button.setPointerCapture(event.pointerId);
                  }
                  startPushToTalk();
                },
                onpointerup: stopPushToTalk,
                onpointercancel: stopPushToTalk,
                onlostpointercapture: stopPushToTalk,
                onkeydown: (event: KeyboardEvent) => {
                  if (
                    event.repeat ||
                    (event.key !== " " && event.key !== "Enter")
                  ) {
                    return;
                  }
                  event.preventDefault();
                  startPushToTalk();
                },
                onkeyup: (event: KeyboardEvent) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    stopPushToTalk();
                  }
                },
                onblur: stopPushToTalk,
              },
              pushToTalkActive ? "Release to stop" : "Hold to talk",
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
