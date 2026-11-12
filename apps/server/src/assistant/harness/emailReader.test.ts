import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmailSource,
  createMockEmailReader,
  MAX_EMAIL_BODY_BYTES,
  type EmailListRequest,
  type MockEmail,
  type ReadOnlyEmailReader,
} from "./emailReader.js";

const BASE_MESSAGES: readonly MockEmail[] = [
  {
    id: "received-new",
    receivedAt: "2026-11-05T11:00:00.000Z",
    sentAt: "2026-11-04T08:00:00.000Z",
    senderName: "Ana",
    senderAddress: "ana@example.test",
    subject: "Library visit",
    body: "Plain text body.",
    unread: true,
  },
  {
    id: "received-old",
    receivedAt: "2026-11-04T11:00:00.000Z",
    sentAt: "2026-11-05T10:00:00.000Z",
    senderName: "Bo",
    senderAddress: "bo@example.test",
    subject: "Library hours",
    body: "<p>Open&nbsp;today</p><p><a href=\"https://example.test\">Details</a></p>",
    unread: false,
  },
  {
    id: "archived",
    receivedAt: "2026-11-03T11:00:00.000Z",
    sentAt: "2026-11-03T10:00:00.000Z",
    senderName: "Cy",
    senderAddress: "cy@example.test",
    subject: "Archived",
    body: "Archived message.",
    unread: true,
    folder: "archive",
  },
  {
    id: "sent",
    receivedAt: "2026-11-02T11:00:00.000Z",
    sentAt: "2026-11-02T10:00:00.000Z",
    senderName: "Dee",
    senderAddress: "dee@example.test",
    subject: "Sent message",
    body: "Sent body.",
    unread: false,
    folder: "sent",
  },
  {
    id: "draft",
    receivedAt: "2026-11-01T11:00:00.000Z",
    senderName: "Draft",
    subject: "Draft",
    body: "Draft body.",
    folder: "drafts",
  },
  {
    id: "spam",
    receivedAt: "2026-11-01T10:00:00.000Z",
    senderName: "Spam",
    subject: "Spam",
    body: "Spam body.",
    folder: "spam",
  },
  {
    id: "trash",
    receivedAt: "2026-11-01T09:00:00.000Z",
    senderName: "Trash",
    subject: "Trash",
    body: "Trash body.",
    folder: "trash",
  },
];

const listRequest = (overrides: Partial<EmailListRequest> = {}): EmailListRequest => ({
  ...overrides,
  signal: new AbortController().signal,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReadOnlyEmailReader generic mock contract", () => {
  it("does not cap the total inbox result set at the former example's five messages", async () => {
    const result = await createMockEmailReader().listMessages();
    expect(result.status).toBe("ok");
    expect(result.coverage).toBe("complete");
    expect(result.messages).toHaveLength(9);
  });

  it("combines structured filters with AND and applies a UTC half-open received window", async () => {
    const reader = createMockEmailReader({ messages: BASE_MESSAGES });
    const result = await reader.listMessages(listRequest({
      filters: {
        container: "inbox",
        sender: "ANA@EXAMPLE.TEST",
        subject: "library",
        unread: true,
        sentAt: { from: "2026-11-04T08:00:00Z", to: "2026-11-04T09:00:00Z" },
        receivedAt: { from: "2026-11-05T00:00:00Z", to: "2026-11-06T00:00:00Z" },
      },
    }));

    expect(result).toMatchObject({
      status: "ok",
      coverage: "complete",
      sourceLabel: "Synthetic inbox",
      container: "inbox",
      messages: [{
        sender: { address: "ana@example.test" },
        subject: "Library visit",
        sentAt: {
          value: "2026-11-04T08:00:00.000Z",
          availability: "available",
          provenance: "synthetic",
        },
        receivedAt: "2026-11-05T11:00:00.000Z",
        unread: true,
        source: { kind: "synthetic", label: "Synthetic inbox", container: "inbox" },
      }],
    });
    expect(result.messages[0]?.messageRef).toMatch(/^.+$/);
    expect(JSON.stringify(result)).not.toContain("Plain text body.");
  });

  it("uses half-open UTC sent and received windows", async () => {
    const reader = createMockEmailReader({
      messages: [
        { id: "lower", receivedAt: "2026-11-05T10:00:00Z", sentAt: "2026-11-05T08:00:00Z" },
        { id: "received-upper", receivedAt: "2026-11-05T11:00:00Z", sentAt: "2026-11-05T08:30:00Z" },
        { id: "sent-upper", receivedAt: "2026-11-05T10:30:00Z", sentAt: "2026-11-05T09:00:00Z" },
      ],
    });
    const result = await reader.listMessages(listRequest({
      filters: {
        sentAt: { from: "2026-11-05T08:00:00Z", to: "2026-11-05T09:00:00Z" },
        receivedAt: { from: "2026-11-05T10:00:00Z", to: "2026-11-05T11:00:00Z" },
      },
    }));
    expect(result.messages.map(({ receivedAt }) => receivedAt))
      .toEqual(["2026-11-05T10:00:00.000Z"]);
  });

  it("sorts by receivedAt or sentAt and keeps an opaque cursor bound to its query and reader", async () => {
    const reader = createMockEmailReader({ messages: BASE_MESSAGES });
    const received = await reader.listMessages(listRequest({ pageSize: 1 }));
    expect(received.messages[0]?.subject).toBe("Library visit");
    expect(received.status).toBe("partial");
    expect(received.nextCursor).toBeTruthy();

    const next = await reader.listMessages(listRequest({
      pageSize: 1,
      cursor: received.nextCursor,
    }));
    expect(next.messages[0]?.subject).toBe("Library hours");
    let cursor = next.nextCursor;
    let lastStatus = next.status;
    while (cursor) {
      const page = await reader.listMessages(listRequest({ pageSize: 1, cursor }));
      cursor = page.nextCursor;
      lastStatus = page.status;
    }
    expect(lastStatus).toBe("ok");

    const sent = await reader.listMessages(listRequest({
      sort: { field: "sentAt", direction: "desc" },
    }));
    expect(sent.messages.slice(0, 2).map(({ subject }) => subject))
      .toEqual(["Library hours", "Library visit"]);

    expect(await reader.listMessages(listRequest({
      filters: { subject: "no match" },
      cursor: received.nextCursor,
    }))).toMatchObject({ status: "invalid_request" });
    expect(await reader.listMessages(listRequest({
      pageSize: 1,
      cursor: received.nextCursor,
    }))).toMatchObject({ status: "ok", messages: [{ subject: "Library hours" }] });
    expect(await createMockEmailReader({ messages: BASE_MESSAGES }).listMessages(listRequest({
      pageSize: 1,
      cursor: received.nextCursor,
    }))).toMatchObject({ status: "invalid_request" });
  });

  it("uses a stable opaque-reference tie-break for equal timestamps", async () => {
    const reader = createMockEmailReader({
      messages: [
        { id: "tie-a", receivedAt: "2026-11-05T11:00:00Z" },
        { id: "tie-b", receivedAt: "2026-11-05T11:00:00Z" },
      ],
    });
    const first = await reader.listMessages(listRequest({ pageSize: 100 }));
    const second = await reader.listMessages(listRequest({ pageSize: 100 }));
    expect(first.messages.map(({ messageRef }) => messageRef))
      .toEqual(second.messages.map(({ messageRef }) => messageRef));
    expect(first.messages.map(({ messageRef }) => messageRef))
      .toEqual([...first.messages.map(({ messageRef }) => messageRef)].sort());
  });

  it("includes inbox, archive, and sent in all_mail while excluding drafts, spam, and trash", async () => {
    const reader = createMockEmailReader({ messages: BASE_MESSAGES });
    const inbox = await reader.listMessages(listRequest({ pageSize: 100 }));
    const allMail = await reader.listMessages(listRequest({
      filters: { container: "all_mail" },
      pageSize: 100,
    }));

    expect(inbox.messages.map(({ subject }) => subject))
      .toEqual(["Library visit", "Library hours"]);
    expect(allMail.messages.map(({ subject }) => subject))
      .toEqual(["Library visit", "Library hours", "Archived", "Sent message"]);
    expect(allMail.messages.every(({ source }) => source.label === "Synthetic all mail")).toBe(true);
    expect(await reader.listMessages(listRequest({
      filters: { container: "sent" as never },
    }))).toMatchObject({ status: "unsupported", reason: "unsupported_container" });
  });

  it("lists all_mail sent messages with missing receivedAt and sorts missing times last", async () => {
    const reader = createMockEmailReader({
      messages: [
        { id: "inbox-new", receivedAt: "2026-11-05T11:00:00Z", subject: "New", folder: "inbox" },
        { id: "inbox-old", receivedAt: "2026-11-05T10:00:00Z", subject: "Old", folder: "inbox" },
        { id: "sent-no-received", sentAt: "2026-11-05T10:00:00Z", subject: "Sent", unread: true, folder: "sent" },
      ],
    });
    const result = await reader.listMessages(listRequest({
      filters: { container: "all_mail" },
      pageSize: 100,
    }));

    expect(result.status).toBe("ok");
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map(({ subject }) => subject)).toEqual(["New", "Old", "Sent"]);
    expect(result.messages[2]?.receivedAt).toBeUndefined();
    const ascending = await reader.listMessages(listRequest({
      filters: { container: "all_mail" },
      sort: { field: "receivedAt", direction: "asc" },
      pageSize: 100,
    }));
    expect(ascending.messages.map(({ subject }) => subject)).toEqual(["Old", "New", "Sent"]);
    expect(await reader.countUnread("all_mail")).toMatchObject({ status: "ok", count: 1, accuracy: "exact" });
    expect(await reader.listMessages(listRequest({
      filters: {
        container: "all_mail",
        receivedAt: { from: "2026-11-01T00:00:00Z", to: "2026-11-06T00:00:00Z" },
      },
      pageSize: 100,
    }))).toMatchObject({ status: "ok", messages: [{ subject: "New" }, { subject: "Old" }] });
  });

  it("supports provider adapters with neutral safe source and timestamp provenance types", async () => {
    const source = createEmailSource("provider", "Work mailbox", "all_mail");
    const providerReader: ReadOnlyEmailReader = {
      async listMessages() {
        return {
          status: "ok",
          sourceLabel: source.label,
          container: "all_mail",
          coverage: "complete",
          messages: [
            {
              messageRef: "opaque-provider-reference",
              sender: { name: "Sender", address: "sender@example.test" },
              subject: "Sent without receivedAt",
              sentAt: { availability: "available", provenance: "provider", value: "2026-11-05T10:00:00Z" },
              unread: false,
              source,
            },
            {
              messageRef: "opaque-header-reference",
              sender: { name: "Sender", address: "sender@example.test" },
              subject: "Header date",
              sentAt: { availability: "available", provenance: "sender_supplied", value: "2026-11-05T09:00:00Z" },
              receivedAt: "2026-11-05T10:01:00Z",
              unread: true,
              source,
            },
            {
              messageRef: "opaque-missing-reference",
              sender: { name: "Sender", address: "sender@example.test" },
              subject: "No sentAt",
              sentAt: { availability: "missing", provenance: "missing" },
              receivedAt: "2026-11-05T10:02:00Z",
              unread: false,
              source,
            },
          ],
        };
      },
      async getMessageContent(messageRef) {
        return {
          status: "ok",
          sourceLabel: source.label,
          source,
          messageRef,
          text: "Provider content.",
          availability: "available",
          truncated: false,
        };
      },
      async countUnread() {
        return {
          status: "ok",
          sourceLabel: source.label,
          container: "all_mail",
          count: 1,
          accuracy: "estimated",
        };
      },
    };

    const result = await providerReader.listMessages();
    expect(result.messages[0]?.receivedAt).toBeUndefined();
    expect(result.messages.map(({ sentAt }) => sentAt.provenance))
      .toEqual(["provider", "sender_supplied", "missing"]);
    expect(Object.keys(result.messages[0]!.source).sort())
      .toEqual(["container", "kind", "label"]);
    expect(() => createEmailSource("provider", "https://provider.example", "all_mail"))
      .toThrow(/safe display label/);
    expect(await providerReader.getMessageContent(result.messages[0]!.messageRef))
      .toMatchObject({ source: { kind: "provider", label: "Work mailbox", container: "all_mail" } });
  });

  it("returns message content on demand as normalized plain text and truncates at 64 KiB UTF-8", async () => {
    const reader = createMockEmailReader({
      messages: [
        ...BASE_MESSAGES,
        { id: "large", receivedAt: "2026-10-30T00:00:00Z", body: "🙂".repeat(MAX_EMAIL_BODY_BYTES / 4 + 1) },
      ],
    });
    const listed = await reader.listMessages(listRequest({ pageSize: 100 }));
    const htmlRef = listed.messages.find(({ subject }) => subject === "Library hours")!.messageRef;
    const html = await reader.getMessageContent(htmlRef);
    expect(html).toMatchObject({
      status: "ok",
      availability: "available",
      text: "Open today Details",
      sourceLabel: "Synthetic inbox",
      source: { kind: "synthetic", container: "inbox" },
    });
    expect(html).not.toHaveProperty("attachments");
    expect(html).not.toHaveProperty("links");

    const largeRef = listed.messages.find(({ subject }) => subject === "Subject unavailable")!.messageRef;
    const large = await reader.getMessageContent(largeRef);
    expect(large).toMatchObject({ status: "ok", availability: "truncated", truncated: true });
    expect(new TextEncoder().encode(large.text).byteLength).toBe(MAX_EMAIL_BODY_BYTES);

    const linkedReader = createMockEmailReader({
      messages: [{ id: "linked", receivedAt: "2026-11-05T11:00:00Z", body: "Read more at https://example.test/mail." }],
    });
    const linkedList = await linkedReader.listMessages(listRequest());
    const linked = await linkedReader.getMessageContent(linkedList.messages[0]!.messageRef);
    expect(linked.text).toBe("Read more at [link omitted]");
    expect(linked.text).not.toContain("https://");
  });

  it("rejects foreign refs and reports missing body availability explicitly", async () => {
    const reader = createMockEmailReader({ messages: BASE_MESSAGES });
    const listed = await reader.listMessages(listRequest({ pageSize: 100 }));
    const ref = listed.messages[0]!.messageRef;
    expect(await createMockEmailReader({ messages: BASE_MESSAGES.slice(1) }).getMessageContent(ref))
      .toMatchObject({ status: "invalid_request", reason: "invalid_message_ref" });

    const missingReader = createMockEmailReader({
      messages: [{ id: "missing", receivedAt: "2026-11-05T11:00:00Z" }],
    });
    const missingList = await missingReader.listMessages(listRequest());
    expect(missingList.messages[0]?.sentAt)
      .toEqual({ availability: "missing", provenance: "missing" });
    expect(await missingReader.getMessageContent(missingList.messages[0]!.messageRef))
      .toMatchObject({ status: "ok", availability: "missing", text: "", truncated: false });
  });

  it("counts unread messages by inbox or all_mail and reports exact fixture accuracy", async () => {
    const result = createMockEmailReader({ messages: BASE_MESSAGES });
    expect(await result.countUnread()).toMatchObject({
      status: "ok",
      container: "inbox",
      count: 1,
      accuracy: "exact",
      sourceLabel: "Synthetic inbox",
    });
    expect(await result.countUnread("all_mail")).toMatchObject({
      status: "ok",
      container: "all_mail",
      count: 2,
      accuracy: "exact",
      sourceLabel: "Synthetic all mail",
    });
    expect(await result.countUnread("sent" as never))
      .toMatchObject({ status: "unsupported", reason: "unsupported_container" });
  });

  it("distinguishes invalid requests, unavailable lookups, and cancellation", async () => {
    const reader = createMockEmailReader({ messages: BASE_MESSAGES, status: "unavailable" });
    expect(await reader.listMessages(listRequest({ pageSize: 101 })))
      .toMatchObject({ status: "invalid_request" });
    expect(await reader.listMessages(listRequest({ filters: null as never })))
      .toMatchObject({ status: "invalid_request" });
    expect(await reader.listMessages(listRequest({
      filters: { sentAt: { from: "2026-11-06T00:00:00Z", to: "2026-11-05T00:00:00Z" } },
    }))).toMatchObject({ status: "invalid_request" });
    expect(await reader.listMessages(listRequest({
      filters: { receivedAt: { from: "2026-02-31T00:00:00Z", to: "2026-03-01T00:00:00Z" } },
    }))).toMatchObject({ status: "invalid_request" });
    expect(await reader.listMessages(listRequest())).toMatchObject({ status: "unavailable" });
    expect(await reader.countUnread()).toMatchObject({ status: "unavailable" });

    expect(await createMockEmailReader({ messages: [] }).listMessages(listRequest()))
      .toMatchObject({ status: "empty", coverage: "complete", messages: [] });

    const controller = new AbortController();
    controller.abort();
    expect(await createMockEmailReader().listMessages({ signal: controller.signal }))
      .toMatchObject({ status: "cancelled" });
  });

  it("makes no provider network requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const reader = createMockEmailReader({ messages: BASE_MESSAGES });
    const listed = await reader.listMessages(listRequest());
    await reader.getMessageContent(listed.messages[0]!.messageRef);
    await reader.countUnread();
    expect(fetch).not.toHaveBeenCalled();
  });
});
