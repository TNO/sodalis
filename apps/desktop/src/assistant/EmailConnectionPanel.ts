import m from "mithril";
import {
  EmailConnectionClient,
  type EmailConnectionResult,
} from "./EmailConnectionClient.js";

export interface EmailConnectionPanelOptions {
  readonly client?: EmailConnectionClient;
  readonly navigate?: (url: string) => void;
}

export function emailCallbackNotice(status: string | null): string | undefined {
  switch (status) {
    case "authorization_denied":
      return "Email authorization was denied or cancelled.";
    case "credential_unavailable":
      return "The email client's secure credential is unavailable. Configure the OS password manager and retry.";
    case "insufficient_scope":
      return "The provider did not grant the required email-only permissions. Reconnect and approve them.";
    case "invalid_callback":
    case "invalid_token":
      return "The email connection could not be verified. No access was saved; try again.";
    case "provider_unavailable":
      return "The email provider could not complete the connection. Try again.";
    default:
      return undefined;
  }
}

export function createEmailConnectionPanel(options: EmailConnectionPanelOptions = {}): m.Component {
  const client = options.client ?? new EmailConnectionClient();
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  let state: EmailConnectionResult = { status: "unavailable" };
  let busy = false;
  let error: string | undefined;

  const refresh = async () => {
    state = await client.status();
    m.redraw();
  };

  return {
    oninit() {
      void refresh();
    },
    view() {
      if (state.status === "unavailable") return null;
      const { connection } = state;
      const callbackNotice = emailCallbackNotice(new URLSearchParams(window.location.search).get("email"));
      return m("section.email-connection[aria-labelledby='email-connection-title']", [
        m("h3#email-connection-title", "Read-only email"),
        m("p", connection.disclosure),
        m("p", `Permission: ${connection.scopes.length ? connection.scopes.join(", ") : "synthetic inbox only"}.`),
        connection.connected
          ? m("p[role=status]", `Connected to ${connection.accountLabel ?? connection.provider}.`)
          : m("p[role=status]", "Inbox not connected."),
        callbackNotice ? m("p[role=alert]", callbackNotice) : null,
        error ? m("p[role=alert]", error) : null,
        connection.connected
          ? m("button[type=button]", {
              disabled: busy,
              onclick: async () => {
                busy = true;
                error = undefined;
                try {
                  await client.disconnect();
                  await refresh();
                } catch {
                  error = "Email access could not be disconnected.";
                } finally {
                  busy = false;
                  m.redraw();
                }
              },
            }, "Disconnect inbox")
          : m("button[type=button]", {
              disabled: busy,
              onclick: async () => {
                busy = true;
                error = undefined;
                try {
                  const result = await client.connect();
                  if (result.authorizeUrl) navigate(result.authorizeUrl);
                  else await refresh();
                } catch (failure) {
                  error = failure instanceof Error ? failure.message : "Email connection could not be started.";
                } finally {
                  busy = false;
                  m.redraw();
                }
              },
            }, "Connect inbox"),
        m("p.email-connection-note", connection.disconnectNotice),
      ]);
    },
  };
}
