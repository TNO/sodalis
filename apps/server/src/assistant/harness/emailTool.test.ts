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
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });

    expect(result).toMatchObject({
      status: "ok",
      provider: "mock",
      sourceLabel: "Synthetic inbox",
      window: { since: "2026-10-29T12:00:00.000Z", until: "2026-11-05T12:00:00.000Z" },
      coverage: "complete",
      residentGuidance: expect.stringContaining("This is synthetic mock evidence"),
      messages: [
        { sender: { name: "Ana", address: "ana@example.test" }, subject: "Visit", body: "I will visit Friday at 14:00.", source: { kind: "synthetic", label: "Synthetic inbox" } },
        { sender: { name: "Bo", address: "bo@example.test" }, subject: "Delivery", body: "The parcel arrives Monday.", source: { kind: "synthetic", label: "Synthetic inbox" } },
        { sender: { name: "Cy", address: "cy@example.test" }, subject: "Library", body: "Your book is ready.", source: { kind: "synthetic", label: "Synthetic inbox" } },
        { sender: { name: "Dee", address: "dee@example.test" }, subject: "Lunch", body: "Lunch is at noon.", source: { kind: "synthetic", label: "Synthetic inbox" } },
        { sender: { name: "Eli", address: "eli@example.test" }, subject: "Walk", body: "Meet at the park gate.", source: { kind: "synthetic", label: "Synthetic inbox" } },
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
    const reader = { readRecentInbox: vi.fn() };
    const tools = createHomeTools({
      emailReader: reader,
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
      message: "I can only summarize the five most recent messages in the explicitly selected synthetic email fixture.",
    });
    expect(reader.readRecentInbox).not.toHaveBeenCalled();
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
      message: "Read-only email is off. Select EMAIL_PROVIDER=mock to use synthetic fixtures.",
    });
  });

  it("refuses reads while content-capturing audits are active", async () => {
    const reader = createMockEmailReader({ now: () => UNTIL });
    const result = await callEmailTool({
      emailReader: reader,
      emailAuditEnabled: true,
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(result).toEqual({ status: "unavailable", reason: "content_audit_enabled" });
  });

  it("reads fixtures with visibly synthetic evidence", async () => {
    const result = await callEmailTool({
      emailReader: createMockEmailReader({ messages: [], now: () => UNTIL }),
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(result).toMatchObject({
      status: "empty",
      provider: "mock",
      sourceLabel: "Synthetic inbox",
      coverage: "complete",
    });
  });

  it("preserves actionable empty and partial guidance for resident delivery", async () => {
    const empty = await callEmailTool({
      emailReader: createMockEmailReader({ messages: [], now: () => UNTIL }),
      budget: { onUnproductive: vi.fn() },
      now: () => UNTIL,
    });
    expect(empty).toMatchObject({
      status: "empty",
      coverage: "complete",
      residentGuidance: "The complete synthetic fixture lookup found no qualifying messages. State that this is a fixture result.",
    });
    const partial = await callEmailTool({
      emailReader: createMockEmailReader({
        messages: [{ id: "partial", receivedAt: "2026-11-05T11:00:00Z", body: "Synthetic evidence." }],
        status: "partial",
        now: () => UNTIL,
      }),
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
