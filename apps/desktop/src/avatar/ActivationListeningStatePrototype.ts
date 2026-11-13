import m from "mithril";
import type { Vnode } from "mithril";

// Three activation/listening UX variants on the desktop overlay, switchable with ?variant=A|B|C.
type Phase = "armed" | "listening" | "speaking" | "stopped" | "muted";
type Trigger = "wake-word" | "stand-button" | "avatar-prompt";

const variants = [
  { key: "A", name: "Conversation card" },
  { key: "B", name: "Avatar attention" },
  { key: "C", name: "Room-level banner" },
] as const;

const triggers: { key: Trigger; label: string; activation: string }[] = [
  { key: "wake-word", label: "Wake word", activation: "Hey Sodalis" },
  { key: "stand-button", label: "Stand button", activation: "Stand button" },
  { key: "avatar-prompt", label: "Avatar prompt", activation: "Sodalis's prompt" },
];

const descriptions: Record<Phase, { title: string; detail: string }> = {
  armed: {
    title: "Armed",
    detail: "",
  },
  listening: {
    title: "Listening now",
    detail: "Speak when you're ready. Your words will appear here.",
  },
  speaking: {
    title: "Sodalis is speaking",
    detail: "Read along with the text below. The microphone is off.",
  },
  stopped: {
    title: "Listening stopped",
    detail: "This conversation card will close in a few seconds.",
  },
  muted: {
    title: "Muted",
    detail: "Sodalis is not listening. Turn activation back on when you choose.",
  },
};

const armedDetails: Record<Trigger, string> = {
  "wake-word": "Armed - wake word on this tablet",
  "stand-button": "Stand button ready",
  "avatar-prompt": "Waiting for Sodalis",
};

const playChime = () => {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(660, now);
  oscillator.frequency.setValueAtTime(880, now + 0.12);
  gain.gain.setValueAtTime(0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => void context.close();
  oscillator.start(now);
  oscillator.stop(now + 0.36);
};

const selectedVariant = () => {
  const key = new URLSearchParams(window.location.search).get("variant");
  return variants.find((variant) => variant.key === key) ?? variants[0];
};

const updateVariant = (key: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState(null, "", url);
  m.redraw();
};

export const ActivationListeningStatePrototype = (): m.Component => {
  let phase: Phase = "armed";
  let trigger: Trigger = "wake-word";
  let chimeEnabled = true;
  let flowTimer: number | undefined;
  let draft = "";
  let activationEvent = "";
  let userTranscript = "";
  let assistantResponse = "";

  const clearFlowTimer = () => {
    if (flowTimer === undefined) return;
    window.clearTimeout(flowTimer);
    flowTimer = undefined;
  };

  const activate = () => {
    if (phase !== "armed" && phase !== "stopped") return;
    clearFlowTimer();
    const sourceEvent =
      trigger === "wake-word"
        ? "Wake word heard"
        : trigger === "stand-button"
          ? "Stand button pressed"
          : "Sodalis offered a listening window";
    activationEvent = `${sourceEvent} · ${chimeEnabled ? "chime played" : "no chime"}`;
    userTranscript = "";
    assistantResponse = "";
    phase = "listening";
    if (chimeEnabled) playChime();
    m.redraw();
  };

  const respondTo = (message: string) => {
    userTranscript = message;
    assistantResponse =
      "Of course. Here is a draft you can read along with: Thank you for your message. I will get back to you soon.";
    phase = "speaking";
    clearFlowTimer();
    flowTimer = window.setTimeout(() => {
      if (phase !== "speaking") return;
      phase = "stopped";
      m.redraw();
      flowTimer = window.setTimeout(() => {
        if (phase !== "stopped") return;
        phase = "armed";
        flowTimer = undefined;
        m.redraw();
      }, 4000);
    }, 4000);
  };

  const simulateSpeech = () => {
    if (phase !== "listening") return;
    respondTo("Could you help me reply to this email?");
  };

  const submitText = (event: SubmitEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || phase !== "listening") return;
    draft = "";
    respondTo(message);
  };

  const mute = () => {
    clearFlowTimer();
    phase = "muted";
    m.redraw();
  };

  const unmute = () => {
    if (phase !== "muted") return;
    phase = "armed";
    m.redraw();
  };

  const renderAvatar = (className: string) =>
    m(
      `div.activation-mock-avatar.${className}`,
      {
        role: "img",
        "aria-label": `Sodalis avatar, ${descriptions[phase].title.toLowerCase()}`,
        "data-attention": String(phase === "listening" || phase === "speaking"),
      },
      [
        m(".activation-avatar-head", [
          m(".activation-avatar-eye"),
          m(".activation-avatar-eye"),
        ]),
        m(".activation-avatar-body"),
      ],
    );

  const renderStatus = () => {
    const status = descriptions[phase];
    return m(
      ".activation-status",
      {
        "data-state": phase,
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
      },
      [
        m(".activation-status-dot[aria-hidden=true]"),
        m("div", [
          m("p.activation-status-title", status.title),
          m("p.activation-status-detail", status.detail),
        ]),
      ],
    );
  };

  const renderIdleIndicator = () => {
    if (phase !== "armed" && phase !== "muted") return null;
    const label = phase === "muted" ? "Muted" : armedDetails[trigger];
    return m(
      ".activation-idle-indicator",
      { "data-state": phase, role: "status", "aria-live": "polite" },
      [
        m(".activation-status-dot[aria-hidden=true]"),
        m("span", label),
        phase === "muted"
          ? m("button[type=button]", { onclick: unmute }, "Turn activation back on")
          : null,
      ],
    );
  };

  const renderTranscript = () =>
    m(".activation-transcript", [
      userTranscript
        ? m(".activation-transcript-block", [
            m("p.activation-speaker", "You"),
            m("p.activation-transcript-text", userTranscript),
          ])
        : m(
            "p.activation-transcript-placeholder",
            "Your words will appear here as you speak.",
          ),
      assistantResponse
        ? m(".activation-transcript-block.activation-response", [
            m("p.activation-speaker", "Sodalis"),
            m("p.activation-transcript-text", assistantResponse),
          ])
        : null,
    ]);

  const renderTextFallback = () =>
    m(
      "form.activation-text-form",
      { onsubmit: submitText },
      [
        m("label[for=activation-text-fallback]", "Or type a message"),
        m(".activation-text-row", [
          m("input#activation-text-fallback[type=text]", {
            value: draft,
            placeholder: "Type a message",
            autocomplete: "off",
            oninput: (event: Event) => {
              draft = (event.currentTarget as HTMLInputElement).value;
            },
          }),
          m("button[type=submit]", { disabled: !draft.trim() }, "Send"),
        ]),
      ],
    );

  const renderActions = () => {
    if (phase === "listening") {
      return m("button.activation-mute[type=button]", { onclick: mute }, "Mute now");
    }
    if (phase === "speaking") {
      return m("p.activation-mute-hint", "The microphone is off while Sodalis speaks.");
    }
    return null;
  };

  const renderConversationContent = (title: string) => [
    m(".activation-card-header", [
      m("div", [
        m("p.activation-eyebrow", "TALK WITH SODALIS"),
        m("h2", title),
      ]),
      m(".activation-card-indicator", { "data-state": phase, "aria-hidden": "true" }),
    ]),
    m("p.activation-activation-event", activationEvent),
    renderStatus(),
    renderTranscript(),
    phase === "listening" ? renderTextFallback() : null,
    renderActions(),
  ];

  const renderVariant = (key: string) => {
    const active = phase !== "armed" && phase !== "muted";
    if (key === "B") {
      return m(".activation-variant.activation-variant-b", [
        renderAvatar("activation-avatar-large"),
        renderIdleIndicator(),
        active
          ? m(
              ".activation-avatar-focus",
              renderConversationContent(
                phase === "listening"
                  ? "I'm listening"
                  : phase === "speaking"
                    ? "Sodalis is speaking"
                    : "Conversation ended",
              ),
            )
          : null,
      ]);
    }
    if (key === "C") {
      return m(".activation-variant.activation-variant-c", [
        renderAvatar("activation-avatar-banner"),
        renderIdleIndicator(),
        active
          ? m(".activation-room-banner", [
              m(".activation-room-banner-top", [
                m("p.activation-eyebrow", "SODALIS"),
                m("span.activation-state-name", descriptions[phase].title),
              ]),
              ...renderConversationContent("Your conversation"),
            ])
          : null,
      ]);
    }
    return m(".activation-variant.activation-variant-a", [
      renderAvatar("activation-avatar-card"),
      renderIdleIndicator(),
      active
        ? m(".activation-conversation-card", renderConversationContent("Your conversation"))
        : null,
    ]);
  };

  const renderPrototypeControls = () =>
    m(".activation-prototype-controls", [
      m(".activation-prototype-heading", [
        m("span.activation-prototype-label", "INTERACTION UX · PROTOTYPE"),
        m("span.activation-prototype-safety", "No microphone connected"),
      ]),
      m("div.activation-trigger-picker[role=group][aria-label='Choose an activation to simulate']", [
        ...triggers.map((item) =>
          m(
            "button[type=button]",
            {
              class: trigger === item.key ? "activation-trigger-selected" : "",
              "aria-pressed": String(trigger === item.key),
              onclick: () => {
                trigger = item.key;
              },
            },
            item.label,
          ),
        ),
      ]),
      m(".activation-sound-controls", [
        m("button[type=button]", {
          class: chimeEnabled ? "activation-chime-enabled" : "",
          "aria-pressed": String(chimeEnabled),
          onclick: () => {
            chimeEnabled = !chimeEnabled;
          },
        }, `Chime ${chimeEnabled ? "on" : "off"}`),
        m("button[type=button]", { onclick: playChime }, "Hear chime"),
        m("button.activation-simulate-trigger[type=button]", {
          disabled: phase !== "armed" && phase !== "stopped",
          onclick: activate,
        }, `Simulate ${triggers.find((item) => item.key === trigger)?.activation}`),
        m("button[type=button]", {
          disabled: phase !== "listening",
          onclick: simulateSpeech,
        }, "Simulate spoken turn"),
      ]),
    ]);

  const moveVariant = (offset: number) => {
    const currentIndex = variants.findIndex((variant) => variant.key === selectedVariant().key);
    const nextIndex = (currentIndex + offset + variants.length) % variants.length;
    updateVariant(variants[nextIndex].key);
  };

  const onKeydown = (event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.matches("input, textarea, [contenteditable='true']")
    ) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveVariant(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveVariant(1);
    }
  };

  return {
    oncreate() {
      window.addEventListener("keydown", onKeydown);
    },
    onremove() {
      clearFlowTimer();
      window.removeEventListener("keydown", onKeydown);
    },
    view(_vnode: Vnode) {
      const variant = selectedVariant();
      return m(".activation-prototype-layer.desktop-avatar-layer", [
        m(".activation-prototype", [
          renderPrototypeControls(),
          renderVariant(variant.key),
          m(".activation-variant-switcher[aria-label='Prototype variants']", [
            m("button[type=button]", {
              "aria-label": "Previous variant",
              onclick: () => moveVariant(-1),
            }, "←"),
            m("span", `${variant.key} · ${variant.name}`),
            m("button[type=button]", {
              "aria-label": "Next variant",
              onclick: () => moveVariant(1),
            }, "→"),
          ]),
        ]),
      ]);
    },
  };
};
