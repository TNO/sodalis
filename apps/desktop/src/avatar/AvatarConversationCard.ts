import m from "mithril";
import type { Vnode, VnodeDOM } from "mithril";
import type {
  ConversationState,
  PendingActionConfirmation,
} from "@sodalis/assistant";
import type { SpeechInputController } from "@sodalis/speech";
import { positionAvatarCompanionCard } from "./AvatarCompanionCardPosition.js";
import type { CompanionPreferences } from "./companionPreferences.js";

interface AvatarConversationCardAttrs {
  preferences?: CompanionPreferences;
  speechInput?: SpeechInputController;
  speechActivityMessage?: string;
  /** Display name of a cloud recognizer that receives microphone audio. */
  cloudSpeechRecognizer?: string;
  speechError?: string;
  speechOutputError?: string;
  speechCaptionError?: string;
  userTranscript?: string;
  assistantText?: string;
  activeSpeechWordIndex?: number;
  speechOutputActive?: boolean;
  speechPlaying?: boolean;
  conversationState?: ConversationState;
  conversationError?: string;
  pendingConfirmation?: PendingActionConfirmation;
  onSpeechError?: (error: Error) => void;
  onSpeechOutputError?: (error: Error) => void;
  onSpeak?: (text: string) => Promise<void>;
  onStopSpeaking?: () => void;
  onCancelTurn?: () => void;
  onConfirmAction?: (confirmationId: string) => Promise<void>;
  onCancelAction?: (confirmationId: string) => void;
  onSend?: (text: string) => Promise<void>;
  onConversationError?: (error: Error) => void;
  onClose: () => void;
}

function renderCaption(text: string, activeWordIndex?: number): m.Children {
  const content: m.Children = [];
  const expression = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let previousEnd = 0;
  let wordIndex = 0;
  for (const match of text.matchAll(expression)) {
    const start = match.index;
    const word = match[0];
    if (start > previousEnd) content.push(text.slice(previousEnd, start));
    content.push(
      m(
        "span.avatar-conversation-caption-word",
        activeWordIndex === wordIndex
          ? {
              class: "avatar-conversation-caption-word-active",
              "aria-current": "true",
            }
          : {},
        word,
      ),
    );
    previousEnd = start + word.length;
    wordIndex += 1;
  }
  if (previousEnd < text.length) content.push(text.slice(previousEnd));
  return content;
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
    let revealedContentKey: string | undefined;
    let currentAttrs: AvatarConversationCardAttrs | undefined;

    const revealContent = (attrs: AvatarConversationCardAttrs) => {
      const content = card?.querySelector<HTMLElement>(".avatar-conversation-content");
      if (!content?.clientHeight) return;
      const error = attrs.conversationError ?? attrs.speechError ?? attrs.speechOutputError ?? actionError;
      const key = JSON.stringify([
        attrs.assistantText ?? caption, attrs.activeSpeechWordIndex,
        attrs.preferences?.subtitleSize, attrs.preferences?.subtitles,
        attrs.pendingConfirmation?.id, error,
      ]);
      if (key === revealedContentKey) return;
      revealedContentKey = key;
      const selector = error
        ? ".avatar-conversation-status"
        : attrs.pendingConfirmation
          ? ".avatar-conversation-confirmation"
          : attrs.preferences?.subtitles === false
            ? ".avatar-response-transcript summary"
            : attrs.activeSpeechWordIndex !== undefined
              ? '[aria-current="true"]'
              : ".avatar-conversation-caption";
      const target = content.querySelector<HTMLElement>(selector);
      if (!target) return;
      const bounds = content.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      if (targetBounds.top < bounds.top || targetBounds.bottom > bounds.bottom) {
        content.scrollTop += targetBounds.top - bounds.top;
      }
    };

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
      const content = card.querySelector<HTMLElement>(".avatar-conversation-content");
      const contentOverflow = content ? content.scrollHeight - content.clientHeight : 0;
      const naturalHeight = Math.max(
        cardBounds.height,
        card.scrollHeight + contentOverflow + 2,
      );

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
        revealContent(vnode.attrs);
        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(() => {
            updatePosition();
            revealedContentKey = undefined;
            if (currentAttrs) revealContent(currentAttrs);
          });
          resizeObserver.observe(card);
          const layer = card.closest<HTMLElement>(".desktop-avatar-layer");
          const avatar = layer?.querySelector<HTMLElement>(".avatar-viewport");
          if (layer) resizeObserver.observe(layer);
          if (avatar) resizeObserver.observe(avatar);
        }
      },

      onupdate(vnode) {
        updatePosition();
        revealContent(vnode.attrs);
      },

      onremove() {
        resizeObserver?.disconnect();
        resizeObserver = undefined;
        card = undefined;
      },

      view(vnode: Vnode<AvatarConversationCardAttrs>) {
        currentAttrs = vnode.attrs;
        const speechInput = vnode.attrs.speechInput;
        const pendingConfirmation = vnode.attrs.pendingConfirmation;
        const speechState = speechInput?.state;
        const requestingPermission =
          speechState?.status === "requesting-permission";
        const listening = speechState?.status === "listening";
        const statusMessage =
          vnode.attrs.speechError
            ? `Microphone error: ${vnode.attrs.speechError}`
            : vnode.attrs.conversationError
              ? `Assistant error: ${vnode.attrs.conversationError}`
            : vnode.attrs.speechOutputError
              ? `Speech output error: ${vnode.attrs.speechOutputError}`
            : vnode.attrs.conversationState === "awaiting-confirmation"
              ? "An application action needs your confirmation."
            : vnode.attrs.conversationState === "thinking"
              ? "Sodalis is thinking."
              : vnode.attrs.conversationState === "transcribing"
                ? "Transcribing speech…"
                : vnode.attrs.conversationState === "interrupted"
                  ? "Response interrupted."
            : vnode.attrs.speechOutputActive
              ? vnode.attrs.speechPlaying
                ? "Sodalis is speaking."
                : "Preparing speech."
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
          draft = "";
          const send = vnode.attrs.onSend;
          if (send) {
            void send(message).catch((error: unknown) => {
              const normalized =
                error instanceof Error ? error : new Error(String(error));
              vnode.attrs.onConversationError?.(normalized);
            });
          } else {
            transcript = message;
            caption =
              "Thanks for telling me. Live assistant replies are not connected yet.";
          }
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
            m(".avatar-conversation-content[tabindex=0][role=region][aria-label='Conversation transcript and status']", [
              m("div.avatar-conversation-transcript[aria-live=polite][aria-atomic=true]", [
                m("p.avatar-conversation-speaker", "You"),
                m(
                  "p.avatar-conversation-user-text",
                  vnode.attrs.userTranscript ?? transcript,
                ),
                m("p.avatar-conversation-speaker", "Sodalis"),
                m(
                  vnode.attrs.preferences?.subtitles === false ? "details.avatar-response-transcript" : "div",
                  [
                    vnode.attrs.preferences?.subtitles === false ? m("summary", "Read response") : null,
                    m(
                      "p.avatar-conversation-caption",
                      vnode.attrs.preferences?.subtitles !== false && vnode.attrs.preferences
                        ? {
                          class: "avatar-conversation-caption-custom",
                          style: {
                            fontSize: `${vnode.attrs.preferences.subtitleSize}px`,
                            color: vnode.attrs.preferences.subtitleColor,
                            backgroundColor: vnode.attrs.preferences.subtitleBackground,
                          },
                        }
                        : {},
                      renderCaption(
                        vnode.attrs.assistantText ?? caption,
                        vnode.attrs.preferences?.subtitles === false ? undefined : vnode.attrs.activeSpeechWordIndex,
                      ),
                    ),
                  ],
                ),
                vnode.attrs.speechCaptionError && vnode.attrs.preferences?.subtitles !== false
                  ? m(
                    "p.avatar-conversation-caption-status[role=status]",
                    `Word highlighting unavailable: ${vnode.attrs.speechCaptionError}`,
                  )
                  : null,
              ]),
              m(
                "p.avatar-conversation-status[role=status][aria-live=polite]",
                statusMessage,
              ),
              listening && vnode.attrs.cloudSpeechRecognizer
                ? m(
                  "p.avatar-conversation-cloud-notice",
                  `Speech recognized by ${vnode.attrs.cloudSpeechRecognizer} (cloud)`,
                )
                : null,
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
                    if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
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
              pendingConfirmation
                ? m(
                  "section.avatar-conversation-confirmation[role=group][aria-labelledby=avatar-action-confirmation-title]",
                  [
                    m("h3#avatar-action-confirmation-title", "Confirm this action"),
                    m("p.avatar-conversation-confirmation-summary", pendingConfirmation.summary),
                    m("p.avatar-conversation-confirmation-phrase",
                      `By voice, say "${pendingConfirmation.confirmationPhrase}" to approve.`),
                    m("div.avatar-conversation-confirmation-actions", [
                      m("button[type=button]", {
                        onclick: () => {
                          const confirm = vnode.attrs.onConfirmAction;
                          if (!confirm) return;
                          void confirm(pendingConfirmation.id).catch((error: unknown) => {
                            vnode.attrs.onConversationError?.(
                              error instanceof Error ? error : new Error(String(error)),
                            );
                          });
                        },
                        disabled: !vnode.attrs.onConfirmAction,
                      }, "Confirm action"),
                      m("button[type=button]", {
                        onclick: () => vnode.attrs.onCancelAction?.(pendingConfirmation.id),
                        disabled: !vnode.attrs.onCancelAction,
                      }, "Cancel action"),
                    ]),
                  ],
                )
                : null,
            ]),
            m("footer.avatar-conversation-footer", [
              m(".avatar-conversation-controls", [
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
                vnode.attrs.conversationState !== "thinking" ? m(
                  "button.avatar-conversation-speak[type=button]",
                  {
                    disabled: vnode.attrs.speechOutputActive
                      ? !vnode.attrs.onStopSpeaking
                      : !vnode.attrs.onSpeak,
                    onclick: () => {
                      if (vnode.attrs.speechOutputActive) {
                        vnode.attrs.onStopSpeaking?.();
                        return;
                      }
                      const text = (
                        vnode.attrs.assistantText ?? caption
                      ).trim();
                      if (!text) return;
                      const speak = vnode.attrs.onSpeak;
                      if (!speak) return;
                      void speak(text).catch((error: unknown) => {
                        const normalized =
                          error instanceof Error
                            ? error
                            : new Error(String(error));
                        if (vnode.attrs.onSpeechOutputError) {
                          vnode.attrs.onSpeechOutputError(normalized);
                        } else {
                          handleActionError(normalized, vnode.attrs);
                        }
                      });
                    },
                  },
                  vnode.attrs.speechOutputActive ? "Stop speaking" : "Read aloud",
                ) : null,
                vnode.attrs.conversationState === "thinking"
                  ? m(
                    "button.avatar-conversation-cancel[type=button]",
                    {
                      onclick: vnode.attrs.onCancelTurn,
                      disabled: !vnode.attrs.onCancelTurn,
                    },
                    "Cancel response",
                  )
                  : null,
              ]),
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
            ]),
          ],
        );
      },
    };
  };
