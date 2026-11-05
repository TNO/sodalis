// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailConnectionClient } from "./EmailConnectionClient.js";
import { createEmailConnectionPanel, emailCallbackNotice } from "./EmailConnectionPanel.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function statusPayload(connected: boolean) {
  return {
    provider: "gmail",
    connected,
    ...(connected ? { accountLabel: "resident@example.test" } : {}),
    csrfToken: "test-csrf-token",
    disclosure: "Inbox and message bodies are read for this request.",
    disconnectNotice: "Google revocation is attempted.",
    scopes: ["openid", "https://www.googleapis.com/auth/gmail.readonly"],
  };
}

let host: HTMLElement | undefined;

function mountPanel(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  navigate?: (url: string) => void,
) {
  host = document.createElement("div");
  document.body.append(host);
  m.mount(host, createEmailConnectionPanel({
    client: new EmailConnectionClient({ fetch: fetcher }),
    navigate,
  }));
  return host;
}

afterEach(() => {
  if (host) m.mount(host, null);
  host = undefined;
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("email OAuth callback notice", () => {
  it("explains expected authorization failures without exposing provider details", () => {
    expect(emailCallbackNotice("authorization_denied")).toMatch(/denied or cancelled/i);
    expect(emailCallbackNotice("insufficient_scope")).toMatch(/email-only permissions/i);
    expect(emailCallbackNotice("credential_unavailable")).toMatch(/OS password manager/i);
    expect(emailCallbackNotice("invalid_token")).toMatch(/No access was saved/i);
    expect(emailCallbackNotice("provider_unavailable")).toMatch(/Try again/i);
    expect(emailCallbackNotice("connected")).toBeUndefined();
    expect(emailCallbackNotice("unrecognized-provider-error")).toBeUndefined();
  });
});

describe("email connection panel", () => {
  it("starts authorization and navigates to the provider address", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse({
          status: "redirect",
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?scope=openid",
        });
      }
      return jsonResponse(statusPayload(false));
    });
    const navigate = vi.fn();
    const panel = mountPanel(fetcher, navigate);

    await vi.waitFor(() => expect(panel.textContent).toContain("Inbox not connected."));
    panel.querySelector<HTMLButtonElement>("button")!.click();

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?scope=openid"),
    );
    expect(panel.textContent).toContain("Read-only email");
    expect(fetcher).toHaveBeenCalledWith("/api/email/connect", expect.objectContaining({ method: "POST" }));
  });

  it("refreshes connection state after disconnecting", async () => {
    let statusCalls = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ status: "disconnected" });
      statusCalls += 1;
      return jsonResponse(statusPayload(statusCalls === 1));
    });
    const panel = mountPanel(fetcher);

    await vi.waitFor(() => expect(panel.textContent).toContain("Connected to resident@example.test."));
    panel.querySelector<HTMLButtonElement>("button")!.click();

    await vi.waitFor(() => expect(panel.textContent).toContain("Inbox not connected."));
    expect(statusCalls).toBe(2);
    expect(fetcher).toHaveBeenCalledWith("/api/email/connection", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows a safe connection error when authorization cannot be started", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? jsonResponse({ error: "provider_unavailable" }, 503)
        : jsonResponse(statusPayload(false)),
    );
    const panel = mountPanel(fetcher);

    await vi.waitFor(() => expect(panel.textContent).toContain("Inbox not connected."));
    panel.querySelector<HTMLButtonElement>("button")!.click();

    await vi.waitFor(() => expect(panel.textContent).toContain("The email provider is unavailable. Try again."));
    expect(panel.querySelector('[role="alert"]')?.textContent).not.toContain("provider_unavailable");
  });

  it("keeps the connected state and explains a failed disconnect", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "DELETE"
        ? jsonResponse({ error: "unavailable" }, 503)
        : jsonResponse(statusPayload(true)),
    );
    const panel = mountPanel(fetcher);

    await vi.waitFor(() => expect(panel.textContent).toContain("Connected to resident@example.test."));
    panel.querySelector<HTMLButtonElement>("button")!.click();

    await vi.waitFor(() => expect(panel.textContent).toContain("Email access could not be disconnected."));
    expect(panel.textContent).toContain("Connected to resident@example.test.");
  });
});
