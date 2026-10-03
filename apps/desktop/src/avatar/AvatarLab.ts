import m from "mithril";
import type { VnodeDOM } from "mithril";
import {
  AVATAR_EXPRESSIONS,
  AVATAR_FRAMINGS,
  AVATAR_STATES,
  type AvatarAffect,
  type AvatarExpression,
  type AvatarFramingName,
  type AvatarQuality,
  type AvatarState,
} from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import type { AttentionManager } from "./AttentionManager.js";
import {
  AVATAR_DOCK_POSITIONS,
  AVATAR_PRESENTATION_MODES,
  type AvatarDockPosition,
  type AvatarPresentationController,
  type AvatarPresentationMode,
} from "./AvatarPresentationController.js";

export interface AvatarLabState {
  state: AvatarState;
  affect: AvatarAffect;
  framing: AvatarFramingName;
  quality: AvatarQuality;
  reducedMotion: boolean;
  showGazeTarget: boolean;
  gazeOverlay: string;
  error?: string;
}

interface AvatarLabAttrs {
  scene?: AvatarSceneHandle;
  attention: AttentionManager;
  value: AvatarLabState;
  presentation?: AvatarPresentationController;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function report(state: AvatarLabState, action: () => void): void {
  try {
    action();
    state.error = undefined;
  } catch (error) {
    state.error = errorMessage(error);
  }
}

function gazeOverlayForReadMessage(
  bounds: DOMRectReadOnly,
): string {
  const x = Math.min(window.innerWidth, Math.max(0, bounds.left + bounds.width / 2));
  const y = Math.min(window.innerHeight, Math.max(0, bounds.top + bounds.height / 2));
  const xPercent = Math.round((x / Math.max(1, window.innerWidth)) * 100);
  const yPercent = Math.round((y / Math.max(1, window.innerHeight)) * 100);
  return `Gaze target: Read message · ${xPercent}% × ${yPercent}%`;
}

export function createAvatarLabState(): AvatarLabState {
  return {
    state: "idle",
    affect: {
      valence: 0,
      arousal: 0.3,
      expression: "neutral",
      intensity: 0.4,
    },
    framing: "upper-body",
    quality: "auto",
    reducedMotion: false,
    showGazeTarget: false,
    gazeOverlay: "Gaze target: User",
  };
}

export function createAvatarLab(): m.Component<AvatarLabAttrs> {
  let unregisterTarget: (() => void) | undefined;

  return {
    onremove() {
      unregisterTarget?.();
      unregisterTarget = undefined;
    },

    view(vnode) {
      const { scene, attention, value } = vnode.attrs;
      const presentation = vnode.attrs.presentation;
      const controller = scene?.controller;
      const run = (action: () => void) =>
        report(value, () => {
          if (!scene) throw new Error("Avatar scene is not ready.");
          action();
        });
      const runPresentation = (action: () => void) =>
        report(value, () => {
          if (!presentation) {
            throw new Error("Avatar presentation is not ready.");
          }
          action();
        });
      const presentationState = presentation?.state;

      return m("details.avatar-lab", [
        m("summary", "Avatar Lab"),
        m(".avatar-lab-content", [
          m(
            "p.avatar-lab-help",
            "Developer controls use deterministic motion only; no audio service is connected.",
          ),
          m(".avatar-lab-grid", [
            m("label.avatar-lab-field", [
              "Presentation",
              m(
                "select",
                {
                  value: presentationState?.mode ?? "ambient",
                  disabled: !presentation,
                  onchange: (event: Event) => {
                    const mode = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarPresentationMode;
                    runPresentation(() => presentation?.setMode(mode));
                  },
                },
                AVATAR_PRESENTATION_MODES.map((mode) =>
                  m("option", { value: mode }, mode),
                ),
              ),
            ]),
            m("label.avatar-lab-field", [
              "Dock",
              m(
                "select",
                {
                  value: presentationState?.dock ?? "right",
                  disabled: !presentation,
                  onchange: (event: Event) => {
                    const dock = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarDockPosition;
                    runPresentation(() => presentation?.setDock(dock));
                  },
                },
                AVATAR_DOCK_POSITIONS.map((dock) =>
                  m("option", { value: dock }, dock),
                ),
              ),
            ]),
            m("label.avatar-lab-field", [
              "State",
              m(
                "select",
                {
                  value: value.state,
                  disabled: !scene,
                  onchange: (event: Event) => {
                    const state = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarState;
                    value.state = state;
                    run(() => controller?.setState(state));
                  },
                },
                AVATAR_STATES.map((state) =>
                  m("option", { value: state }, state),
                ),
              ),
            ]),
            m("label.avatar-lab-field", [
              "Expression",
              m(
                "select",
                {
                  value: value.affect.expression ?? "neutral",
                  disabled: !scene,
                  onchange: (event: Event) => {
                    const expression = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarExpression;
                    value.affect = { ...value.affect, expression };
                    run(() => controller?.setAffect(value.affect));
                  },
                },
                AVATAR_EXPRESSIONS.map((expression) =>
                  m("option", { value: expression }, expression),
                ),
              ),
            ]),
            m("label.avatar-lab-field", [
              `Intensity · ${value.affect.intensity.toFixed(2)}`,
              m("input[type=range]", {
                min: 0,
                max: 1,
                step: 0.05,
                value: value.affect.intensity,
                "aria-label": "Expression intensity",
                disabled: !scene,
                oninput: (event: Event) => {
                  const intensity = Number(
                    (event.currentTarget as HTMLInputElement).value,
                  );
                  value.affect = { ...value.affect, intensity };
                  run(() => controller?.setAffect(value.affect));
                },
              }),
            ]),
            m("label.avatar-lab-field", [
              "Framing",
              m(
                "select",
                {
                  value: presentationState?.framing ?? value.framing,
                  disabled: !scene,
                  onchange: (event: Event) => {
                    const framing = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarFramingName;
                    value.framing = framing;
                    run(() => {
                      if (presentation) presentation.setFraming(framing);
                      else scene?.setFraming(framing);
                    });
                  },
                },
                AVATAR_FRAMINGS.map((framing) =>
                  m("option", { value: framing }, framing),
                ),
              ),
            ]),
            m("label.avatar-lab-field", [
              "Quality",
              m(
                "select",
                {
                  value: value.quality,
                  disabled: !scene,
                  onchange: (event: Event) => {
                    value.quality = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarQuality;
                    run(() => scene?.setQuality(value.quality));
                  },
                },
                ["low", "medium", "high", "auto"].map((quality) =>
                  m("option", { value: quality }, quality),
                ),
              ),
            ]),
          ]),
          m("label.avatar-lab-motion", [
            m("input[type=checkbox]", {
              checked: value.reducedMotion,
              disabled: !scene,
              onchange: (event: Event) => {
                value.reducedMotion = (
                  event.currentTarget as HTMLInputElement
                ).checked;
                run(() => {
                  controller?.setReducedMotion(value.reducedMotion);
                  presentation?.setReducedMotion(value.reducedMotion);
                });
              },
            }),
            " Reduce incidental motion",
          ]),
          m("label.avatar-lab-motion", [
            m("input[type=checkbox]", {
              checked: presentationState?.visible ?? true,
              disabled: !presentation,
              onchange: (event: Event) => {
                const visible = (
                  event.currentTarget as HTMLInputElement
                ).checked;
                runPresentation(() => {
                  if (!presentation) return;
                  if (visible) presentation.show();
                  else presentation.hide();
                });
              },
            }),
            " Show avatar on desktop",
          ]),
          m("label.avatar-lab-field", [
            `Size · ${(presentationState?.scale ?? 1).toFixed(2)}×`,
            m("input[type=range]", {
              min: 0.75,
              max: 1.25,
              step: 0.05,
              value: presentationState?.scale ?? 1,
              "aria-label": "Avatar presentation size",
              disabled: !presentation,
              oninput: (event: Event) => {
                const scale = Number(
                  (event.currentTarget as HTMLInputElement).value,
                );
                runPresentation(() => presentation?.setScale(scale));
              },
            }),
          ]),
          m("label.avatar-lab-motion", [
            m("input[type=checkbox]", {
              checked: value.showGazeTarget,
              onchange: (event: Event) => {
                value.showGazeTarget = (
                  event.currentTarget as HTMLInputElement
                ).checked;
              },
            }),
            " Show gaze target on desktop",
          ]),
          m(
            "output.avatar-lab-fps[aria-live=polite]",
            scene?.fps === undefined
              ? "Render rate: measuring…"
              : `Render rate: ${Math.round(scene.fps)} FPS`,
          ),
          m(".avatar-lab-actions", [
            m(
              "button[type=button].avatar-lab-primary",
              {
                disabled: !scene,
                onclick: () =>
                  run(() => {
                    const target = attention.resolve("read-message");
                    if (!target?.visible || !target.rect) {
                      throw new Error(
                        'Attention target "read-message" is not visible or registered.',
                      );
                    }
                    controller?.setState("listening");
                    controller?.startMockSpeech();
                    value.state = "speaking";
                    attention.focus("read-message");
                    value.gazeOverlay = gazeOverlayForReadMessage(target.rect);
                  }),
                oncreate(vnode: VnodeDOM) {
                  const button = vnode.dom;
                  if (!(button instanceof HTMLButtonElement)) {
                    throw new Error("Avatar Lab gaze target button is unavailable.");
                  }
                  unregisterTarget = attention.register({
                    id: "read-message",
                    appId: "sodalis.avatar-lab",
                    element: button,
                    role: "button",
                    label: "Read message",
                    description:
                      "Demonstrates semantic highlighting, avatar gaze, and placement avoidance.",
                    importance: "high",
                  });
                },
              },
              "[ Read message ]",
            ),
            m(
              "button[type=button]",
              {
                disabled: !scene,
                onclick: () =>
                  run(() => {
                    attention.clear();
                    controller?.lookAt({ type: "user" });
                    value.gazeOverlay = "Gaze target: User";
                  }),
              },
              "Clear guidance",
            ),
            m(
              "button[type=button]",
              {
                disabled: !scene,
                onclick: () =>
                  run(() => {
                    if (!controller) throw new Error("Avatar controller is unavailable.");
                    void controller.playGesture("nod").catch((error: unknown) => {
                      value.error = errorMessage(error);
                      m.redraw();
                    });
                  }),
              },
              "Nod",
            ),
            m(
              "button[type=button]",
              {
                disabled: !scene,
                onclick: () =>
                  run(() => {
                    controller?.startMockSpeech();
                    value.state = "speaking";
                  }),
              },
              "Mock speaking",
            ),
            m(
              "button[type=button]",
              {
                disabled: !scene,
                onclick: () =>
                  run(() => {
                    controller?.interrupt();
                    value.state = "interrupted";
                  }),
              },
              "Interrupt",
            ),
          ]),
          m("output.avatar-lab-gaze[aria-live=polite]", value.gazeOverlay),
          value.error
            ? m("p.avatar-lab-error[role=alert]", value.error)
            : null,
        ]),
      ]);
    },
  };
}
