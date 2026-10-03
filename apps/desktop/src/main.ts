import m from "mithril";
import { Button, ThemeManager } from "mithril-materialized";
import { createAvatarUiTargetRegistry } from "@sodalis/avatar";
import { AvatarViewport } from "./avatar/AvatarViewport.js";
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

const avatarTargetRegistry = createAvatarUiTargetRegistry();
const AvatarLab = createAvatarLab();
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const DesktopShell = () => {
  const state: {
    host?: DesktopHost;
    applications: DesktopApplication[];
    status: string;
    error?: string;
    avatarScene?: AvatarSceneHandle;
    avatarLab: ReturnType<typeof createAvatarLabState>;
  } = {
    applications: [],
    status: "Connecting to the desktop…",
    avatarLab: createAvatarLabState(),
  };

  const connect = async (frame: HTMLIFrameElement) => {
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
      m(".sodalis-shell", [
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
                  if (frame instanceof HTMLIFrameElement) void connect(frame);
                },
              }),
            ],
          ),
          m("aside.assistant-panel[aria-labelledby='assistant-title']", [
            m("div.assistant-heading", [
              m("h2#assistant-title", "Assistant and avatar"),
            ]),
            m(AvatarViewport, {
              targetRegistry: avatarTargetRegistry,
              gazeOverlay: state.avatarLab.gazeOverlay,
              onScene(scene) {
                if (scene) {
                  scene.setFraming(state.avatarLab.framing);
                  scene.setQuality(state.avatarLab.quality);
                  scene.controller.setReducedMotion(
                    state.avatarLab.reducedMotion,
                  );
                }
                state.avatarScene = scene;
                m.redraw();
              },
            }),
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
                  registry: avatarTargetRegistry,
                  value: state.avatarLab,
                })
              : null,
            m(
              "p.assistant-description",
              "This desktop keeps the open application beside the assistant and avatar.",
            ),
            m("div.desktop-status", [
              m("span.status-indicator[aria-hidden=true]"),
              m("p[role=status][aria-live=polite]", state.status),
            ]),
            state.error
              ? m("p.connection-error[role=alert]", state.error)
              : null,
            m(
              "p.assistant-note",
              "Voice-first conversation and optional captions for spoken replies are planned for a later phase.",
            ),
          ]),
        ]),
      ]),
  };
};

const root = document.getElementById("app");
if (!root) throw new Error("Sodalis desktop root element is missing.");
m.mount(root, DesktopShell);
