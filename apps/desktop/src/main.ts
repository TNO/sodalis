import m from "mithril";
import { Button, ThemeManager } from "mithril-materialized";
import { createAttentionTargetRegistry } from "@sodalis/avatar";
import { DesktopAvatarOverlay } from "./avatar/DesktopAvatarOverlay.js";
import { createAttentionManager } from "./avatar/AttentionManager.js";
import { createAvatarPresentationController } from "./avatar/AvatarPresentationController.js";
import type { SpeechInputController } from "@sodalis/speech";
import {
  createAvatarLab,
  createAvatarLabState,
} from "./avatar/AvatarLab.js";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import {
  createAsterDesktopHost,
  type DesktopApplication,
  type DesktopHost,
} from "@sodalis/desktop-host";
import "mithril-materialized/index.css";
import "./styles.css";

ThemeManager.initialize("auto");

const avatarTargetRegistry = createAttentionTargetRegistry();
const AvatarLab = createAvatarLab();
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const DesktopShell = () => {
  const state: {
    host?: DesktopHost;
    applications: DesktopApplication[];
    status: string;
    error?: string;
    presentationError?: string;
    avatarScene?: AvatarSceneHandle;
    speechInput?: SpeechInputController;
    desktopFrame?: HTMLIFrameElement;
    avatarLab: ReturnType<typeof createAvatarLabState>;
  } = {
    applications: [],
    status: "Connecting to the desktop…",
    avatarLab: createAvatarLabState(),
  };
  const presentation = createAvatarPresentationController({
    onChange: m.redraw,
    onError(error) {
      state.presentationError = error.message;
      m.redraw();
    },
    onFramingChange(framing) {
      state.avatarScene?.setFraming(framing);
    },
  });
  const attention = createAttentionManager({
    registry: avatarTargetRegistry,
    presentation,
    getAvatarController: () => state.avatarScene?.controller,
  });

  const connect = async (frame: HTMLIFrameElement) => {
    state.desktopFrame = frame;
    state.status = "Connecting to the desktop…";
    state.error = undefined;
    try {
      const host = createAsterDesktopHost(frame);
      state.applications = await host.listApplications();
      state.host = host;
      state.status = `Desktop ready. ${state.applications.length} built-in applications are available.`;
    } catch (error) {
      state.host = undefined;
      state.status = "The desktop connection could not be established.";
      state.error = errorMessage(error);
    } finally {
      m.redraw();
    }
  };

  const openSettings = async () => {
    if (!state.host) return;
    state.error = undefined;
    try {
      await state.host.openApplication("settings");
    } catch (error) {
      state.error = errorMessage(error);
    } finally {
      m.redraw();
    }
  };

  return {
    view: () =>
      m(
        ".sodalis-shell",
        {
          oncreate(vnode) {
            attention.attach(vnode.dom as HTMLElement);
          },
          onremove() {
            attention.detach();
          },
        },
        [
          m("header.sodalis-header", [
            m("div.brand", [
              m("span.brand-mark[aria-hidden=true]", "S"),
              m("div", [
                m("h1", "Sodalis"),
                m("p", "Your personal desktop"),
              ]),
            ]),
            m(Button, {
              label: "Open desktop settings",
              disabled: !state.host,
              onclick: () => void openSettings(),
            }),
          ]),
          m("main.desktop-layout", [
            m(
              "section.desktop-pane[aria-label='Desktop workspace']",
              [
                m(
                  ".desktop-scrollport",
                  {
                    tabIndex: 0,
                    "aria-describedby": "desktop-pan-hint",
                  },
                  [
                    m(
                      "p.desktop-scroll-hint#desktop-pan-hint",
                      "Swipe left or right within this desktop to reach off-screen controls.",
                    ),
                    m("iframe", {
                      title: "Aster desktop",
                      src: "./aster/index.html",
                      onload: (event: Event) => {
                        const frame = event.currentTarget;
                        if (frame instanceof HTMLIFrameElement)
                          void connect(frame);
                      },
                    }),
                  ],
                ),
                m(DesktopAvatarOverlay, {
                  targetRegistry: avatarTargetRegistry,
                  onGeometryChange: () => attention.refresh(),
                  gazeOverlay: state.avatarLab.gazeOverlay,
                  showGazeTarget: state.avatarLab.showGazeTarget,
                  frame: state.desktopFrame,
                  onScene(scene) {
                    if (scene) {
                      scene.setFraming(presentation.state.framing);
                      scene.setQuality(state.avatarLab.quality);
                      scene.controller.setReducedMotion(
                        state.avatarLab.reducedMotion,
                      );
                    }
                    state.avatarScene = scene;
                    attention.refresh();
                    m.redraw();
                  },
                  presentation,
                  onSpeechInput(controller) {
                    state.speechInput = controller;
                  },
                  async onOpenApplication(appId) {
                    if (!state.host) {
                      throw new Error("The desktop connection is unavailable.");
                    }
                    await state.host.openApplication(appId);
                  },
                }),
              ],
            ),
            m("aside.assistant-panel[aria-labelledby='assistant-title']", [
              m("div.assistant-heading", [
                m("h2#assistant-title", "Assistant"),
              ]),
              m("p.avatar-attribution", [
                "Avatar model: ",
                m(
                  "a",
                  {
                    href: "https://github.com/met4citizen/TalkingHead/blob/v1.7.0/avatars/brunette.glb",
                    target: "_blank",
                    rel: "noreferrer",
                  },
                  "Ready Player Me brunette (TalkingHead example)",
                ),
                " · ",
                m(
                  "a",
                  {
                    href: "https://creativecommons.org/licenses/by-nc/4.0/",
                    target: "_blank",
                    rel: "noreferrer",
                  },
                  "CC BY-NC 4.0",
                ),
              ]),
              import.meta.env.DEV
                ? m(AvatarLab, {
                    scene: state.avatarScene,
                    attention,
                    value: state.avatarLab,
                    presentation,
                  })
                : null,
              m(
                "p.assistant-description",
                "The avatar stays with the desktop while applications open and close.",
              ),
              m("div.desktop-status", [
                m("span.status-indicator[aria-hidden=true]"),
                m("p[role=status][aria-live=polite]", state.status),
              ]),
              state.error
                ? m("p.connection-error[role=alert]", state.error)
                : null,
              state.presentationError
                ? m("p.connection-error[role=alert]", state.presentationError)
                : null,
              m(
                "p.assistant-note",
                "Speech recognition and assistant responses are planned for a later phase.",
              ),
            ]),
          ]),
        ],
      ),
  };
};

const root = document.getElementById("app");
if (!root) throw new Error("Sodalis desktop root element is missing.");
m.mount(root, DesktopShell);
