import m from "mithril";
import {
  subtitleContrast,
  type CompanionPreferences,
  type CompanionPreferenceStore,
} from "./companionPreferences.js";

export const CompanionSettings = (): m.Component<{ store: CompanionPreferenceStore }> => {
  let error: string | undefined;
  return {
    view({ attrs: { store } }) {
      const value = store.value;
      const update = (patch: Partial<CompanionPreferences>) => {
        try {
          store.update(patch);
          error = undefined;
        } catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure);
        }
      };
      const check = (key: "shortSentences" | "subtitles", label: string) =>
        m("label.companion-settings-check", [
          m("input[type=checkbox]", {
            checked: value[key],
            onchange: (event: Event) => update({ [key]: (event.currentTarget as HTMLInputElement).checked }),
          }),
          m("span", label),
        ]);
      const color = (key: "subtitleColor" | "subtitleBackground", label: string) =>
        m("label.companion-settings-color", [
          m("span", label),
          m("input[type=color]", {
            value: value[key],
            onchange: (event: Event) => update({ [key]: (event.currentTarget as HTMLInputElement).value }),
          }),
        ]);
      return m("details.companion-settings", [
        m("summary", "Speech and subtitles"),
        m("fieldset", [
          m("legend", "Speech"),
          m("label", [
            m("span", `Speech speed: ${value.speechRate.toFixed(2)}x`),
            m("input[type=range][min=0.75][max=1.25][step=0.05]", {
              value: value.speechRate,
              "aria-valuetext": `${value.speechRate.toFixed(2)} times normal speed`,
              oninput: (event: Event) => update({ speechRate: Number((event.currentTarget as HTMLInputElement).value) }),
            }),
          ]),
          m("label", [
            m("span", `Pause between sentences: ${value.sentencePauseMs} ms`),
            m("input[type=range][min=0][max=1000][step=10]", {
              value: value.sentencePauseMs,
              "aria-valuetext": `${value.sentencePauseMs} milliseconds`,
              oninput: (event: Event) => update({ sentencePauseMs: Number((event.currentTarget as HTMLInputElement).value) }),
            }),
          ]),
          check("shortSentences", "Ask for short, clear sentences"),
          m("p", "Changes apply to the next response. Standard Azure voices use prosody; other voices use playback speed, which can change pitch. Pauses are added to the voice's natural pauses. Short sentences are a model instruction, not a guarantee."),
        ]),
        m("fieldset", [
          m("legend", "Subtitles"),
          check("subtitles", "Show subtitles"),
          m("label", [
            m("span", "Subtitle size"),
            m("select", {
              value: String(value.subtitleSize),
              onchange: (event: Event) => update({ subtitleSize: Number((event.currentTarget as HTMLSelectElement).value) }),
            }, [16, 20, 24, 28, 32].map((size) => m("option", { value: String(size) }, `${size} px`))),
          ]),
          m(".companion-settings-colors", [
            color("subtitleColor", "Text color"),
            color("subtitleBackground", "Background color"),
          ]),
          m("p.companion-subtitle-preview", {
            style: {
              fontSize: `${value.subtitleSize}px`,
              color: value.subtitleColor,
              backgroundColor: value.subtitleBackground,
            },
          }, "Sodalis: Take your time."),
          subtitleContrast(value) < 4.5
            ? m("p.companion-settings-warning[role=alert]", "Low subtitle contrast. Choose a lighter text or darker background (or the reverse).")
            : null,
          m("p", "When subtitles are off, Read response still shows the text. Confirmations and errors remain visible."),
        ]),
        error ? m("p.connection-error[role=alert]", error) : null,
      ]);
    },
  };
};
