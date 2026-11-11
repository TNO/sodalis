import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockEmailReader } from "./emailReader.js";
import { createHomeTools } from "./tools.js";

async function callTool(
  tools: ReturnType<typeof createHomeTools>,
  name: string,
  params: unknown,
) {
  const tool = tools.find((candidate) => candidate.name === name)!;
  const result = await tool.execute("email-call", params as never, undefined, undefined, undefined as never);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generic email harness tools", () => {
  it("exposes list, on-demand content, and unread count alongside ordinary tools", async () => {
    const reader = createMockEmailReader();
    const tools = createHomeTools({
      emailReader: reader,
      budget: { onUnproductive: vi.fn() },
    });

    expect(tools.map(({ name }) => name)).toEqual([
      "find_entities",
      "inspect_neighborhood",
      "read_external_data",
      "list_messages",
      "get_message_content",
      "count_unread",
    ]);

    const listed = await callTool(tools, "list_messages", {
      filters: { subject: "library" },
      sort: { field: "receivedAt", direction: "desc" },
      pageSize: 10,
    });
    expect(listed).toMatchObject({
      status: "ok",
      sourceLabel: "Synthetic inbox",
      messages: [{ subject: "Library", source: { kind: "synthetic" } }],
    });

    const ref = ((listed.messages as Array<{ messageRef: string }>)[0]!).messageRef;
    expect(await callTool(tools, "get_message_content", { messageRef: ref }))
      .toMatchObject({ status: "ok", text: "Your book is ready." });
    expect(await callTool(tools, "count_unread", { container: "all_mail" }))
      .toMatchObject({ status: "ok", count: 7, accuracy: "exact", container: "all_mail" });
    expect(await callTool(tools, "list_messages", { filters: { container: "sent" } }))
      .toMatchObject({ status: "unsupported", reason: "unsupported_container" });
    expect(await callTool(tools, "count_unread", { container: "sent" }))
      .toMatchObject({ status: "unsupported", reason: "unsupported_container" });
  });

  it("keeps all email operations available without question classification", async () => {
    const reader = createMockEmailReader();
    const tools = createHomeTools({
      emailReader: reader,
      budget: { onUnproductive: vi.fn() },
    });
    const alternateQuestions = [
      "Find unread messages from Ana.",
      "How many unread messages are in all mail?",
      "What does the latest library email say?",
    ];

    for (const question of alternateQuestions) {
      expect(question).not.toContain("five most recent");
      expect(tools.map(({ name }) => name)).toEqual(expect.arrayContaining([
        "list_messages",
        "get_message_content",
        "count_unread",
      ]));
    }
  });

  it("does not expose email operations when no mock reader is configured", () => {
    const tools = createHomeTools({ budget: { onUnproductive: vi.fn() } });
    expect(tools.map(({ name }) => name)).toEqual([
      "find_entities",
      "inspect_neighborhood",
      "read_external_data",
    ]);
  });

  it("does not read email while content-capturing audits are active", async () => {
    const reader = {
      listMessages: vi.fn(),
      getMessageContent: vi.fn(),
      countUnread: vi.fn(),
    };
    const tools = createHomeTools({
      emailReader: reader,
      emailAuditEnabled: true,
      budget: { onUnproductive: vi.fn() },
    });
    expect(await callTool(tools, "count_unread", {}))
      .toMatchObject({ status: "unavailable", reason: "content_audit_enabled" });
    expect(reader.countUnread).not.toHaveBeenCalled();
  });

  it("keeps mock operations synthetic and makes no network requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const tools = createHomeTools({
      emailReader: createMockEmailReader(),
      budget: { onUnproductive: vi.fn() },
    });
    const result = await callTool(tools, "list_messages", { pageSize: 1 });
    expect(result).toMatchObject({
      status: "partial",
      sourceLabel: "Synthetic inbox",
      messages: [{ source: { kind: "synthetic" } }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
