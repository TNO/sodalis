import { describe, expect, it } from "vitest";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { createAssistantApp } from "../app.js";
import { EmailConnectionCoordinator } from "./emailAuthorization.js";
import { CompanionWorkflows } from "./workflow.js";

function application(createSession: () => Promise<AgentSession> = async () => {
  throw new Error("not used");
}) {
  const emailConnections = new EmailConnectionCoordinator({
    settings: { provider: "mock", residentId: "resident-1" },
    credentials: { get: async () => undefined },
  });
  const workflows = new CompanionWorkflows({
    createSession,
    emailConnections,
  });
  return { app: createAssistantApp({ workflows }), emailConnections };
}

describe("same-origin email connection routes", () => {
  it("creates an HttpOnly session and discloses mock setup without credentials", async () => {
    const { app } = application();
    const response = await app.request("/api/email/connection");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toMatch(/sodalis_email_session=.*HttpOnly; SameSite=Lax/);
    expect(await response.json()).toMatchObject({
      provider: "mock",
      connected: false,
      scopes: [],
      reconnectAfter: "expiry, disconnect or server restart",
    });
  });

  it("requires same-origin CSRF for explicit connect and disconnect", async () => {
    const { app } = application();
    const status = await app.request("/api/email/connection");
    const cookie = status.headers.get("set-cookie")!.split(";")[0]!;
    const statusBody = await status.json() as { csrfToken: string };
    expect((await app.request("/api/email/connect", {
      method: "POST",
      headers: { cookie, "x-sodalis-csrf": statusBody.csrfToken },
    })).status).toBe(403);

    const connected = await app.request("/api/email/connect", {
      method: "POST",
      headers: {
        cookie,
        origin: "http://localhost",
        "x-sodalis-csrf": statusBody.csrfToken,
      },
    });
    expect(await connected.json()).toEqual({ status: "connected" });
    expect((await app.request("/api/email/connection", { headers: { cookie } })).status).toBe(200);

    const disconnected = await app.request("/api/email/connection", {
      method: "DELETE",
      headers: {
        cookie,
        origin: "http://localhost",
        "x-sodalis-csrf": statusBody.csrfToken,
      },
    });
    expect(await disconnected.json()).toMatchObject({ status: "disconnected", upstreamRevoked: false });
    const after = await app.request("/api/email/connection", { headers: { cookie } });
    expect(await after.json()).toMatchObject({ connected: false });
  });

  it("rejects copied CSRF tokens from another host session", async () => {
    const { app } = application();
    const first = await app.request("/api/email/connection");
    const firstCookie = first.headers.get("set-cookie")!.split(";")[0]!;
    const csrfToken = (await first.json() as { csrfToken: string }).csrfToken;
    const second = await app.request("/api/email/connection");
    const secondCookie = second.headers.get("set-cookie")!.split(";")[0]!;
    expect((await app.request("/api/email/connect", {
      method: "POST",
      headers: { cookie: secondCookie, origin: "http://localhost", "x-sodalis-csrf": csrfToken },
    })).status).toBe(403);
    expect((await app.request("/api/email/connection", { headers: { cookie: firstCookie } })).status).toBe(200);
  });

  it("cancels the active email workflow on disconnect without publishing an answer", async () => {
    const { app } = application(() => new Promise<AgentSession>(() => {}));
    const status = await app.request("/api/email/connection");
    const cookie = status.headers.get("set-cookie")!.split(";")[0]!;
    const csrfToken = (await status.json() as { csrfToken: string }).csrfToken;
    await app.request("/api/email/connect", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", "x-sodalis-csrf": csrfToken },
    });

    const workflow = await app.request("/api/assistant/workflows", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "conversation-1",
        workflowId: "workflow-1",
        inputId: "input-1",
        messages: [{ role: "user", content: "What are my five most recent inbox emails from the last seven days? Summarize each." }],
      }),
    });
    const events = workflow.body!.getReader();
    expect(new TextDecoder().decode((await events.read()).value)).toContain('"type":"started"');

    await app.request("/api/email/connection", {
      method: "DELETE",
      headers: { cookie, origin: "http://localhost", "x-sodalis-csrf": csrfToken },
    });
    const terminal = await events.read();
    expect(new TextDecoder().decode(terminal.value)).toContain('"type":"cancelled"');
    expect(new TextDecoder().decode(terminal.value)).not.toContain('"type":"answer"');
  });
});
