import m from "mithril";
import { Button, ThemeManager } from "mithril-materialized";
import {
  createAsterDesktopHost,
  type DesktopApplication,
  type DesktopHost,
} from "@sodalis/desktop-host";
import "mithril-materialized/index.css";
import "./styles.css";

ThemeManager.initialize("auto");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const DesktopShell = () => {
  const state: {
    host?: DesktopHost;
    applications: DesktopApplication[];
    status: string;
    error?: string;
  } = {
    applications: [],
    status: "Connecting to the desktop…",
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
            m(
              ".avatar-placeholder",
              {
                role: "img",
                "aria-label":
                  "Empty placeholder for the future three-dimensional avatar.",
              },
              m("span", "3D avatar will appear here."),
            ),
            m(
              "p.assistant-description",
              "This desktop keeps the open application beside the future assistant and avatar.",
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
