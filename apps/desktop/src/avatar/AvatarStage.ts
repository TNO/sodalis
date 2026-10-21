import m from "mithril";
import { createAttentionTargetRegistry } from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import { createAttentionManager } from "./AttentionManager.js";
import { createAvatarLab, createAvatarLabState } from "./AvatarLab.js";
import { createAvatarPresentationController } from "./AvatarPresentationController.js";
import { AvatarViewport } from "./AvatarViewport.js";
import {
  ACTIVE_AVATAR_ASSET,
  ACTIVE_AVATAR_CREDIT,
  AVATAR_CATALOGUE,
} from "./defaultAvatar.js";
import { pickOnDeviceVoice, speakOnStage } from "./stageSpeech.js";

const SAMPLE_LINE =
  "Hello, I'm your Sodalis assistant. Shall we look at your messages together?";


/**
 * Development-only full-window view for judging an avatar's face, lip sync,
 * gaze and upper-body motion at high quality.
 */
export const AvatarStage = (): m.Component => {
  const registry = createAttentionTargetRegistry();
  const lab = createAvatarLabState();
  lab.quality = "high";
  const Lab = createAvatarLab();
  let scene: AvatarSceneHandle | undefined;
  let text = SAMPLE_LINE;
  let rate = 1;
  let useVoice = true;
  let voices: SpeechSynthesisVoice[] = [];
  const synth = typeof speechSynthesis === "undefined" ? undefined : speechSynthesis;
  const refreshVoices = () => {
    voices = synth?.getVoices() ?? [];
    m.redraw();
  };
  const presentation = createAvatarPresentationController({ storage: undefined });
  const attention = createAttentionManager({
    registry,
    presentation,
    getAvatarController: () => scene?.controller,
  });

  const say = () => {
    if (!scene) return;
    const voice = useVoice ? pickOnDeviceVoice(voices) : undefined;
    try {
      speakOnStage({
        text,
        rate,
        controller: scene.controller,
        ...(voice && synth ? { voice, synth } : {}),
      });
      lab.state = "speaking";
      lab.error = undefined;
    } catch (error) {
      lab.error = error instanceof Error ? error.message : String(error);
    }
  };

  return {
    oncreate(vnode) {
      attention.attach(vnode.dom as HTMLElement);
      refreshVoices();
      synth?.addEventListener("voiceschanged", refreshVoices);
    },
    onremove() {
      synth?.removeEventListener("voiceschanged", refreshVoices);
      synth?.cancel();
      attention.detach();
    },
    view() {
      const voice = pickOnDeviceVoice(voices);
      return m("main.avatar-stage", [
        m(AvatarViewport, {
          look: "stage",
          targetRegistry: registry,
          onScene(next: AvatarSceneHandle | undefined) {
            scene = next;
            if (next) {
              next.setFraming(lab.framing);
              next.setQuality(lab.quality);
            }
            m.redraw();
          },
        }),
        m("aside.avatar-stage-panel", [
          m("h1", ACTIVE_AVATAR_ASSET.name),
          m("p.avatar-attribution", [
            m("a", { href: ACTIVE_AVATAR_CREDIT.href, target: "_blank", rel: "noreferrer" },
              ACTIVE_AVATAR_CREDIT.label),
            " · ",
            m("a", { href: ACTIVE_AVATAR_CREDIT.licenceHref, target: "_blank", rel: "noreferrer" },
              ACTIVE_AVATAR_CREDIT.licence),
          ]),
          m("nav.avatar-stage-avatars[aria-label='Avatars']",
            AVATAR_CATALOGUE.list().map((asset) =>
              m("a", {
                href: `?stage&avatar=${encodeURIComponent(asset.id)}`,
                "aria-current": asset.id === ACTIVE_AVATAR_ASSET.id ? "page" : undefined,
              }, asset.name),
            ),
          ),
          m("form.avatar-stage-say", {
            onsubmit: (event: Event) => {
              event.preventDefault();
              say();
            },
          }, [
            m("label", ["Say", m("textarea", {
              rows: 4,
              value: text,
              oninput: (event: Event) => {
                text = (event.currentTarget as HTMLTextAreaElement).value;
              },
            })]),
            m("label.avatar-stage-inline", [
              `Rate · ${rate.toFixed(2)}`,
              m("input[type=range]", {
                min: 0.6, max: 1.6, step: 0.05, value: rate,
                oninput: (event: Event) => {
                  rate = Number((event.currentTarget as HTMLInputElement).value);
                },
              }),
            ]),
            m("label.avatar-stage-inline", [
              m("input[type=checkbox]", {
                checked: useVoice,
                disabled: !voice,
                onchange: (event: Event) => {
                  useVoice = (event.currentTarget as HTMLInputElement).checked;
                },
              }),
              voice ? ` Speak with on-device voice (${voice.name})` : " No on-device voice; lip sync only",
            ]),
            m("button[type=submit]", { disabled: !scene }, "Say it"),
            m("p.avatar-lab-help",
              "Lip sync uses TalkingHead's English text rules; voice timing is estimated."),
          ]),
          m(Lab, { scene, attention, value: lab }),
        ]),
      ]);
    },
  };
};
