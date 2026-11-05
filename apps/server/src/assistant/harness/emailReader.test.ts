import { describe, expect, it, vi } from "vitest";
import {
  EMAIL_FIXTURE_MESSAGES,
  createGmailEmailReader,
  createGraphEmailReader,
  createMockEmailReader,
  type EmailConnection,
  type EmailHttpResponse,
  type EmailHttpTransport,
  type EmailReaderRequest,
  type ReadOnlyEmailReader,
} from "./emailReader.js";

const WINDOW = {
  since: "2026-10-29T12:00:00.000Z",
  until: "2026-11-05T12:00:00.000Z",
  limit: 5 as const,
};
const connection: EmailConnection = {
  handle: "opaque-email-connection",
  provider: "graph",
  accountLabel: "resident@example.test",
  accessToken: "test-token",
  expiresAt: Date.parse("2027-11-05T13:00:00.000Z"),
  sourceKey: "test-source-key",
};
const gmailConnection: EmailConnection = {
  ...connection,
  handle: "opaque-gmail-connection",
  provider: "gmail",
};
const resolveConnection = vi.fn(async (handle: string) =>
  handle === connection.handle ? connection : handle === gmailConnection.handle ? gmailConnection : undefined,
);

function request(reader: ReadOnlyEmailReader, overrides: Partial<EmailReaderRequest> = {}) {
  return reader.readRecentInbox({
    connectionHandle: connection.handle,
    ...WINDOW,
    signal: new AbortController().signal,
    ...overrides,
  });
}

function graphTransport(): EmailHttpTransport {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/messages")) {
      return jsonResponse({
        value: EMAIL_FIXTURE_MESSAGES.filter((message) =>
          message.inbox !== false && message.id !== "M08" && message.id !== "M09",
        )
          .map((message) => ({
            id: `message-${message.id}`,
            receivedDateTime: message.receivedAt,
            from: { emailAddress: { name: message.senderName, address: message.senderAddress } },
            subject: message.subject,
            isDraft: message.id === "M11",
            parentFolderId: "provider-folder",
          })),
      });
    }
    const id = parsed.pathname.split("/").at(-1)?.replace("message-", "");
    const message = EMAIL_FIXTURE_MESSAGES.find((item) => item.id === id);
    return message ? jsonResponse({ body: { contentType: "text", content: message.body } }) : jsonResponse({}, 404);
  };
}

function gmailTransport(): EmailHttpTransport {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/messages")) {
      return jsonResponse({
        messages: EMAIL_FIXTURE_MESSAGES
          .filter((message) => message.inbox !== false && !message.draft)
          .map((message) => ({ id: `message-${message.id}` })),
      });
    }
    if (parsed.pathname.endsWith("/profile")) {
      return jsonResponse({ emailAddress: "resident@example.test" });
    }
    const id = parsed.pathname.split("/").at(-1)?.replace("message-", "");
    const message = EMAIL_FIXTURE_MESSAGES.find((item) => item.id === id);
    if (!message) return jsonResponse({}, 404);
    if (parsed.searchParams.get("format") === "metadata") {
      return jsonResponse({
        id: `message-${message.id}`,
        internalDate: String(Date.parse(message.receivedAt)),
        labelIds: message.inbox === false
          ? message.id === "M12" ? ["SPAM"] : message.id === "M13" ? ["TRASH"] : []
          : message.draft ? ["INBOX", "DRAFT"] : ["INBOX"],
        payload: {
          headers: [
            { name: "From", value: `${message.senderName} <${message.senderAddress}>` },
            { name: "Subject", value: message.subject },
          ],
        },
      });
    }
    return jsonResponse({
      id: `message-${message.id}`,
      internalDate: String(Date.parse(message.receivedAt)),
      labelIds: ["INBOX"],
      payload: {
        headers: [{ name: "From", value: `${message.senderName} <${message.senderAddress}>` }, { name: "Subject", value: message.subject }],
        mimeType: "text/plain",
        body: { data: Buffer.from(message.body ?? "").toString("base64url") },
      },
    });
  };
}

function jsonResponse(body: unknown, status = 200): EmailHttpResponse {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

const expected = [
  ["M01", "Ana", "Visit", "I will visit Friday at 14:00."],
  ["M02", "Bo", "Delivery", "The parcel arrives Monday."],
  ["M03", "Cy", "Library", "Your book is ready."],
  ["M04", "Dee", "Lunch", "Lunch is at noon."],
  ["M05", "Eli", "Walk", "Meet at the park gate."],
];

describe("ReadOnlyEmailReader", () => {
  it.each([
    ["mock", "mock", () => createMockEmailReader()],
    ["Graph", connection.handle, () => createGraphEmailReader({ transport: graphTransport(), resolveConnection })],
    ["Gmail", gmailConnection.handle, () => createGmailEmailReader({ transport: gmailTransport(), resolveConnection })],
  ])("%s returns the same five independently specified inbox messages", async (_name, handle, createReader) => {
    const result = await request(createReader(), { connectionHandle: handle });
    expect(result).toMatchObject({
      status: "ok",
      window: { since: WINDOW.since, until: WINDOW.until },
      coverage: "complete",
      messages: expected.map(([_id, senderName, subject, body]) => ({
        sender: { name: senderName },
        subject,
        body,
        source: { reference: expect.stringMatching(/^[A-Za-z0-9_-]+$/) },
      })),
    });
    expect(result.messages.map((message) => message.receivedAt)).toEqual([
      "2026-11-05T11:00:00.000Z",
      "2026-11-04T15:00:00.000Z",
      "2026-11-03T09:00:00.000Z",
      "2026-11-02T10:00:00.000Z",
      "2026-11-02T10:00:00.000Z",
    ]);
  });

  it("uses a half-open UTC window and returns empty only after a complete lookup", async () => {
    const reader = createMockEmailReader({ messages: [EMAIL_FIXTURE_MESSAGES[6]!] });
    const result = await request(reader);
    expect(result).toMatchObject({ status: "ok", messages: [{ body: "Start of window." }] });
    expect(await request(createMockEmailReader({ messages: [] }))).toMatchObject({
      status: "empty",
      coverage: "complete",
      messages: [],
    });
  });

  it("rejects arbitrary ranges and limits before resolving an account", async () => {
    resolveConnection.mockClear();
    const reader = createGraphEmailReader({ transport: graphTransport(), resolveConnection });
    await expect(request(reader, { limit: 4 as 5 })).resolves.toMatchObject({ status: "unavailable" });
    expect(resolveConnection).not.toHaveBeenCalled();
  });

  it("maps provider authorization errors distinctly from empty and discards prior evidence", async () => {
    const reader = createGraphEmailReader({
      transport: async () => jsonResponse({ error: "unauthorized" }, 401),
      resolveConnection,
    });
    await expect(request(reader)).resolves.toMatchObject({ status: "unauthorized", messages: [] });
  });

  it("maps an oversized streamed provider response to unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(1_048_577))));
    try {
      await expect(request(createGraphEmailReader({ resolveConnection })))
        .resolves.toMatchObject({ status: "unavailable", coverage: "incomplete", messages: [] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retains complete coverage while explicitly disclosing bounded body truncation", async () => {
      let requestedBody = "";
      const reader = createGraphEmailReader({
        resolveConnection,
        transport: async (url) => {
          const parsed = new URL(url);
          if (parsed.pathname.endsWith("/messages")) {
            return jsonResponse({
              value: [{
                id: "provider-id",
                receivedDateTime: "2026-11-05T11:00:00.000Z",
                from: { emailAddress: { address: "sender@example.test" } },
                subject: "Large",
              }],
            });
          }
          requestedBody = parsed.pathname;
          return jsonResponse({ body: { contentType: "text", content: "x".repeat(9_000) } });
        },
      });
      const result = await request(reader, { connectionHandle: connection.handle });
      expect(result).toMatchObject({
        status: "ok",
        coverage: "complete",
        messages: [{ sender: { name: "Unknown" }, bodyAvailability: "truncated" }],
      });
      expect(Buffer.byteLength(result.messages[0]!.body)).toBeLessThanOrEqual(8_192);
      expect(requestedBody).toContain("/messages/provider-id");
    });

    it("reports a missing selected body as partial rather than complete", async () => {
      const reader = createGraphEmailReader({
        resolveConnection,
        transport: async (url) => new URL(url).pathname.endsWith("/messages")
          ? jsonResponse({
              value: [{
                id: "missing-body",
                receivedDateTime: "2026-11-05T11:00:00.000Z",
                subject: "No body",
              }],
            })
          : jsonResponse({ body: {} }),
      });
      await expect(request(reader, { connectionHandle: connection.handle }))
        .resolves.toMatchObject({
          status: "partial",
          coverage: "incomplete",
          messages: [{ body: "", bodyAvailability: "missing" }],
        });
    });

  it("preserves evidence as partial when a later Graph page fails but discards it on authorization failure", async () => {
      let bodyCalls = 0;
      const firstPage = {
        value: Array.from({ length: 6 }, (_, index) => ({
          id: `page-one-${index}`,
          receivedDateTime: "2026-11-05T11:00:00.000Z",
          from: { emailAddress: { name: `Sender ${index}`, address: `sender${index}@example.test` } },
          subject: `Message ${index}`,
        })),
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=next",
      };
      const partialReader = createGraphEmailReader({
        resolveConnection,
        transport: async (url) => {
          const parsed = new URL(url);
          if (parsed.searchParams.has("$skiptoken")) return jsonResponse({ error: "unavailable" }, 503);
          if (parsed.pathname.endsWith("/messages")) return jsonResponse(firstPage);
          bodyCalls += 1;
          return jsonResponse({ body: { contentType: "text", content: "Message body." } });
        },
      });
      await expect(request(partialReader, { connectionHandle: connection.handle }))
        .resolves.toMatchObject({ status: "partial", coverage: "incomplete", messages: expect.arrayContaining([expect.any(Object)]) });
      expect(bodyCalls).toBe(5);

      const unauthorized = createGraphEmailReader({
        resolveConnection,
        transport: async (url) => new URL(url).pathname.endsWith("/messages") && !new URL(url).searchParams.has("$skiptoken")
          ? jsonResponse(firstPage)
          : jsonResponse({}, 401),
      });
      await expect(request(unauthorized, { connectionHandle: connection.handle }))
        .resolves.toMatchObject({ status: "unauthorized", messages: [] });
    });

  it("continues a tied Graph page boundary and stops only after a strictly older ordered prefix", async () => {
      let pageCount = 0;
      let bodyCount = 0;
      const reader = createGraphEmailReader({
        resolveConnection,
        transport: async (url) => {
          const parsed = new URL(url);
          if (parsed.pathname.endsWith("/messages")) {
            pageCount += 1;
            if (pageCount === 1) {
              return jsonResponse({
                value: Array.from({ length: 50 }, (_, index) => ({
                  id: `tie-${String(index).padStart(2, "0")}`,
                  receivedDateTime: "2026-11-05T11:00:00.000Z",
                  from: { emailAddress: { name: `Sender ${index}`, address: `s${index}@example.test` } },
                  subject: `Tie ${index}`,
                })),
                "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=next",
              });
            }
            return jsonResponse({
              value: [{
                id: "older",
                receivedDateTime: "2026-11-05T10:59:00.000Z",
                from: { emailAddress: { name: "Older", address: "older@example.test" } },
                subject: "Older",
              }],
            });
          }
          bodyCount += 1;
          return jsonResponse({ body: { contentType: "text", content: "Body." } });
        },
      });
      await expect(request(reader, { connectionHandle: connection.handle }))
        .resolves.toMatchObject({ status: "ok", coverage: "complete", messages: expect.any(Array) });
      expect(pageCount).toBe(2);
      expect(bodyCount).toBe(5);

      pageCount = 0;
      const prefixReader = createGraphEmailReader({
        resolveConnection,
        transport: async (url) => {
          const parsed = new URL(url);
          if (parsed.pathname.endsWith("/messages")) {
            pageCount += 1;
            return jsonResponse({
              value: Array.from({ length: 6 }, (_, index) => ({
                id: `prefix-${index}`,
                receivedDateTime: new Date(Date.parse("2026-11-05T11:00:00Z") - index * 60_000).toISOString(),
                from: { emailAddress: { name: `Sender ${index}`, address: `p${index}@example.test` } },
                subject: `Prefix ${index}`,
              })),
              "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=unused",
            });
          }
          return jsonResponse({ body: { contentType: "text", content: "Body." } });
        },
      });
      await expect(request(prefixReader, { connectionHandle: connection.handle }))
        .resolves.toMatchObject({ status: "ok", coverage: "complete" });
      expect(pageCount).toBe(1);
  });

  it("treats a remaining Gmail page at the two-page candidate cap as partial", async () => {
    let page = 0;
    const reader = createGmailEmailReader({
      resolveConnection,
      transport: async (url) => {
        if (new URL(url).pathname.endsWith("/messages")) {
          page += 1;
          return jsonResponse({
            messages: Array.from({ length: 50 }, (_, index) => ({ id: `candidate-${page}-${index}` })),
            nextPageToken: page === 1 ? "next" : "still-more",
          });
        }
        const parsed = new URL(url);
        if (parsed.searchParams.get("format") === "metadata") {
          return jsonResponse({
            id: `metadata-${parsed.pathname.split("/").at(-1)}`,
            internalDate: String(Date.parse("2026-11-05T11:00:00.000Z")),
            labelIds: ["INBOX"],
            payload: { headers: [{ name: "From", value: "Sender <sender@example.test>" }] },
          });
        }
        return jsonResponse({}, 404);
      },
    });
    await expect(request(reader, { connectionHandle: gmailConnection.handle }))
      .resolves.toMatchObject({ status: "partial", coverage: "incomplete" });
    expect(page).toBe(2);
  });

  it("does not follow a provider-supplied continuation URL to another origin", async () => {
    const urls: string[] = [];
    const reader = createGraphEmailReader({
      resolveConnection,
      transport: async (url) => {
        urls.push(url);
        return jsonResponse({ value: [], "@odata.nextLink": "https://attacker.example/collect" });
      },
    });
    await request(reader, { connectionHandle: connection.handle });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https:\/\/graph\.microsoft\.com\//);
  });
});
