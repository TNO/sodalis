import m from "mithril";
import { createAttentionTargetRegistry } from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import { createAttentionManager } from "./AttentionManager.js";
import { createAvatarLab, createAvatarLabState } from "./AvatarLab.js";
import { createAvatarPresentationController } from "./AvatarPresentationController.js";
import { AvatarViewport } from "./AvatarViewport.js";
import { AvatarChoice } from "./AvatarChoice.js";
import { createAvatarSelection } from "./avatarCatalogue.js";
import {
  pickOnDeviceVoice,
  playRecordedOnStage,
  speakOnStage,
  type RecordedClip,
  type RecordedClipIndex,
} from "./stageSpeech.js";

const SAMPLE_LINE =
  "Hello, I'm your Sodalis assistant. Shall we look at your messages together?";
/** Ignored Azure clips with viseme timing, made by `scripts/azure-visemes.py`. */
const RECORDED_BASE = `${import.meta.env.BASE_URL}avatars/eval/speech-nl/`;


/**
 * Development-only full-window view for judging an avatar's face, lip sync,
 * gaze and upper-body motion at high quality.
 */
export const AvatarStage = (): m.Component => {
  const registry = createAttentionTargetRegistry();
  const selection = createAvatarSelection({
    search: location.search,
    onChange: () => m.redraw(),
  });
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
  let recorded: RecordedClipIndex | undefined;
  let clipId = "";
  let audio: HTMLAudioElement | undefined;
  const loadRecorded = async () => {
    try {
      const response = await fetch(`${RECORDED_BASE}index.json`);
      if (!response.ok) return;
      recorded = (await response.json()) as RecordedClipIndex;
      clipId = recorded.clips[0]?.id ?? "";
      m.redraw();
    } catch {
      recorded = undefined;
    }
  };
  const playRecorded = async () => {
    if (!scene || !clipId) return;
    try {
      const response = await fetch(`${RECORDED_BASE}${clipId}.json`);
      if (!response.ok) throw new Error(`Clip ${clipId} is missing.`);
      const clip = (await response.json()) as RecordedClip;
      synth?.cancel();
      audio?.pause();
      audio = new Audio(`${RECORDED_BASE}${clipId}.mp3`);
      await playRecordedOnStage({ clip, audio, controller: scene.controller });
      lab.state = "speaking";
      lab.error = undefined;
    } catch (error) {
      lab.error = error instanceof Error ? error.message : String(error);
    }
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
      void loadRecorded();
    },
    onremove() {
      synth?.removeEventListener("voiceschanged", refreshVoices);
      synth?.cancel();
      audio?.pause();
      attention.detach();
    },
    view() {
      const voice = pickOnDeviceVoice(voices);
      return m("main.avatar-stage", [
        m(AvatarViewport, {
          asset: selection.selected.asset,
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
          m("h1", selection.selected.asset.name),
          m(AvatarChoice, { selection }),
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
          recorded && m("form.avatar-stage-say", {
            onsubmit: (event: Event) => {
              event.preventDefault();
              void playRecorded();
            },
          }, [
            m("label", [`Recorded Dutch (${recorded.voice})`, m("select", {
              value: clipId,
              onchange: (event: Event) => {
                clipId = (event.currentTarget as HTMLSelectElement).value;
              },
            }, recorded.clips.map((clip) =>
              m("option", { value: clip.id }, `${clip.id} · ${clip.text}`),
            ))]),
            m("button[type=submit]", { disabled: !scene }, "Play clip"),
            m("p.avatar-lab-help",
              "Azure TTS audio; lip sync follows Azure's viseme timing."),
          ]),
          m(Lab, { scene, attention, value: lab }),
        ]),
      ]);
    },
  };
};
