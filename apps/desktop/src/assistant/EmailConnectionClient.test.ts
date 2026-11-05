import { describe, expect, it, vi } from "vitest";
import { EmailConnectionClient } from "./EmailConnectionClient.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function statusPayload(overrides: Record<string, unknown> = {}) {
  return {
    provider: "gmail",
    connected: false,
    csrfToken: "in-memory-csrf-token",
    disclosure: "Inbox and message bodies are read for this request.",
    disconnectNotice: "Google revocation is attempted.",
    scopes: ["openid", "https://www.googleapis.com/auth/gmail.readonly"],
    ...overrides,
  };
}

describe("desktop email connection client", () => {
  it("loads same-origin status and keeps the CSRF token out of the public status result", async () => {
    const fetch = vi.fn(async () => jsonResponse(statusPayload()));
    const client = new EmailConnectionClient({ fetch });
    const status = await client.status();
    expect(status).toEqual({
      status: "ready",
      connection: {
        provider: "gmail",
        connected: false,
        disclosure: "Inbox and message bodies are read for this request.",
        disconnectNotice: "Google revocation is attempted.",
        scopes: ["openid", "https://www.googleapis.com/auth/gmail.readonly"],
      },
    });
    expect(fetch).toHaveBeenCalledWith("/api/email/connection", expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
    }));
    expect(JSON.stringify(status)).not.toContain("in-memory-csrf-token");
  });

  it("sends a CSRF-bound explicit connection request and accepts only official HTTPS OAuth hosts", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload()))
      .mockResolvedValueOnce(jsonResponse({
        status: "redirect",
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?scope=openid",
      }));
    const client = new EmailConnectionClient({ fetch });
    await client.status();
    const result = await client.connect();
    expect(result.authorizeUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(fetch).toHaveBeenLastCalledWith("/api/email/connect", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: { "x-sodalis-csrf": "in-memory-csrf-token", accept: "application/json" },
    }));
  });

  it("rejects malformed or attacker-controlled authorization URLs", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload()))
      .mockResolvedValueOnce(jsonResponse({ status: "redirect", authorizeUrl: "https://attacker.example/steal" }));
    const client = new EmailConnectionClient({ fetch });
    await client.status();
    await expect(client.connect()).rejects.toThrow(/invalid authorization address/);
  });

  it("explains missing server-side credentials without exposing response payloads", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload()))
      .mockResolvedValueOnce(jsonResponse({ error: "credential_unavailable", detail: "secret value" }, 503));
    const client = new EmailConnectionClient({ fetch });
    await client.status();
    await expect(client.connect()).rejects.toThrow(/secure credential store/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("disconnects through the same-origin CSRF-protected endpoint and hides unavailable configurations", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload({ connected: true, accountLabel: "me@example.test" })))
      .mockResolvedValueOnce(jsonResponse({ status: "disconnected", upstreamRevoked: true }));
    const client = new EmailConnectionClient({ fetch });
    await client.status();
    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenLastCalledWith("/api/email/connection", expect.objectContaining({
      method: "DELETE",
      headers: { "x-sodalis-csrf": "in-memory-csrf-token", accept: "application/json" },
    }));
    const unavailable = new EmailConnectionClient({ fetch: async () => new Response(null, { status: 404 }) });
    await expect(unavailable.status()).resolves.toEqual({ status: "unavailable" });
  });
});
