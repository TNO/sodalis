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
  type AvatarUiTargetRegistry,
} from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";

export interface AvatarLabState {
  state: AvatarState;
  affect: AvatarAffect;
  framing: AvatarFramingName;
  quality: AvatarQuality;
  reducedMotion: boolean;
  gazeOverlay: string;
  error?: string;
}

interface AvatarLabAttrs {
  scene?: AvatarSceneHandle;
  registry: AvatarUiTargetRegistry;
  value: AvatarLabState;
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
  bounds: { left: number; top: number; width: number; height: number },
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
      const { scene, registry, value } = vnode.attrs;
      const controller = scene?.controller;
      const run = (action: () => void) =>
        report(value, () => {
          if (!scene) throw new Error("Avatar scene is not ready.");
          action();
        });

      return m("details.avatar-lab", [
        m("summary", "Avatar Lab"),
        m(".avatar-lab-content", [
          m(
            "p.avatar-lab-help",
            "Developer controls use deterministic motion only; no audio service is connected.",
          ),
          m(".avatar-lab-grid", [
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
                  value: value.framing,
                  disabled: !scene,
                  onchange: (event: Event) => {
                    value.framing = (event.currentTarget as HTMLSelectElement)
                      .value as AvatarFramingName;
                    run(() => scene?.setFraming(value.framing));
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
                run(() => controller?.setReducedMotion(value.reducedMotion));
              },
            }),
            " Reduce incidental motion",
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
                    const bounds = registry.resolve("read-message");
                    if (!bounds) {
                      throw new Error(
                        'Avatar UI target "read-message" is not visible or registered.',
                      );
                    }
                    controller?.setState("listening");
                    controller?.startMockSpeech();
                    value.state = "speaking";
                    controller?.lookAt({
                      type: "ui-element",
                      id: "read-message",
                    });
                    value.gazeOverlay = gazeOverlayForReadMessage(bounds);
                  }),
                oncreate(vnode: VnodeDOM) {
                  const button = vnode.dom;
                  if (!(button instanceof HTMLButtonElement)) {
                    throw new Error("Avatar Lab gaze target button is unavailable.");
                  }
                  unregisterTarget = registry.register("read-message", () => {
                    const bounds = button.getBoundingClientRect();
                    return {
                      left: bounds.left,
                      top: bounds.top,
                      width: bounds.width,
                      height: bounds.height,
                    };
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
                    controller?.lookAt({ type: "user" });
                    value.gazeOverlay = "Gaze target: User";
                  }),
              },
              "Look at user",
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
