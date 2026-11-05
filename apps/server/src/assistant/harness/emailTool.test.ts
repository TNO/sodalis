import { describe, expect, it, vi } from "vitest";
import { createMockEmailReader } from "./emailReader.js";
import { isApprovedEmailQuestion, isEmailRelatedQuestion } from "./tools.js";
import { createHomeTools } from "./tools.js";

const UNTIL = Date.parse("2026-11-05T12:00:00.000Z");
const APPROVED_QUESTION = "What are my five most recent inbox emails from the last seven days? Summarize each.";

async function callEmailTool(
  options: Parameters<typeof createHomeTools>[0],
  name = "read_recent_inbox",
) {
  const tool = createHomeTools(options).find((candidate) => candidate.name === name)!;
  const result = await tool.execute("email-call", {}, undefined, undefined, undefined as never);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

describe("bounded email harness tool", () => {
  it("only exposes the approved question and fetches the fixed seven-day five-message slice", async () => {
    expect(isApprovedEmailQuestion(APPROVED_QUESTION)).toBe(true);
    expect(isApprovedEmailQuestion("Search my email for the library")).toBe(false);
    expect(isApprovedEmailQuestion("What did my calendar say?")).toBe(false);
    expect(isEmailRelatedQuestion("Search my inbox for the library")).toBe(true);
    const result = await callEmailTool({
      emailReader: createMockEmailReader({ now: () => UNTIL }),
      emailConnectionHandle: "mock-email",
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });

    expect(result).toMatchObject({
      status: "ok",
      window: { since: "2026-10-29T12:00:00.000Z", until: "2026-11-05T12:00:00.000Z" },
      coverage: "complete",
      residentGuidance: expect.stringContaining("disclose any missing or truncated body"),
      messages: [
        { sender: { name: "Ana", address: "ana@example.test" }, subject: "Visit", body: "I will visit Friday at 14:00." },
        { sender: { name: "Bo", address: "bo@example.test" }, subject: "Delivery", body: "The parcel arrives Monday." },
        { sender: { name: "Cy", address: "cy@example.test" }, subject: "Library", body: "Your book is ready." },
        { sender: { name: "Dee", address: "dee@example.test" }, subject: "Lunch", body: "Lunch is at noon." },
        { sender: { name: "Eli", address: "eli@example.test" }, subject: "Walk", body: "Meet at the park gate." },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/accessToken|test-token|refresh_token|client_secret/);
  });

  it("classifies ordinary inbox and mail wording as out-of-scope email requests", () => {
    expect(isEmailRelatedQuestion("Read my mail")).toBe(true);
    expect(isEmailRelatedQuestion("What are my latest emails?")).toBe(true);
    expect(isEmailRelatedQuestion("Please mail the package to my home")).toBe(false);
    expect(isEmailRelatedQuestion("Is the mailbox beside the front door?")).toBe(true);
  });

  it("uses only a limitation tool for wider email questions, without exposing home readers", async () => {
    const tools = createHomeTools({
      emailScopeLimited: true,
      budget: { onUnproductive: vi.fn() },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["email_scope_limit"]);
    const result = await callEmailTool({
      emailScopeLimited: true,
      budget: { onUnproductive: vi.fn() },
    }, "email_scope_limit");
    expect(result).toEqual({
      status: "unsupported_question",
      message: "I can only check the five most recent inbox emails from the last seven days and summarize each.",
    });
  });

  it("does not expose home readers for email requests when email is disabled", async () => {
    const tools = createHomeTools({
      emailScopeLimited: true,
      emailProviderOff: true,
      budget: { onUnproductive: vi.fn() },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["email_scope_limit"]);
    const result = await callEmailTool({
      emailScopeLimited: true,
      emailProviderOff: true,
      budget: { onUnproductive: vi.fn() },
    }, "email_scope_limit");
    expect(result).toEqual({
      status: "unavailable",
      message: "Read-only email is not configured. Ask the local operator to enable an email provider.",
    });
  });

  it("refuses reads while content-capturing audits are active", async () => {
    const reader = createMockEmailReader({ now: () => UNTIL });
    const result = await callEmailTool({
      emailReader: reader,
      emailConnectionHandle: "mock-email",
      emailAuditEnabled: true,
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(result).toEqual({ status: "unavailable", reason: "content_audit_enabled" });
  });

  it("distinguishes a missing session grant from a successful empty inbox", async () => {
    const result = await callEmailTool({
      emailReader: createMockEmailReader({ messages: [], now: () => UNTIL }),
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(result).toEqual({ status: "unauthorized", reason: "connect_email_first", messages: [] });
  });

  it("preserves actionable empty and partial guidance for resident delivery", async () => {
    const empty = await callEmailTool({
      emailReader: createMockEmailReader({ messages: [], now: () => UNTIL }),
      emailConnectionHandle: "mock-email",
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(empty).toMatchObject({
      status: "empty",
      coverage: "complete",
      residentGuidance: "The complete inbox lookup found no qualifying messages. Do not describe this as an authorization or connectivity failure.",
    });
    const partial = await callEmailTool({
      emailReader: createMockEmailReader({
        messages: [{ id: "partial", receivedAt: "2026-11-05T11:00:00Z", body: "Synthetic evidence." }],
        status: "partial",
        now: () => UNTIL,
      }),
      emailConnectionHandle: "mock-email",
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(partial).toMatchObject({
      status: "partial",
      coverage: "incomplete",
      residentGuidance: "Evidence is incomplete and does not establish the five globally most recent messages. State the coverage gap clearly.",
    });
  });
});
