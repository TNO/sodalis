import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockEmailReader, type EmailReaderRequest } from "./emailReader.js";

const request: EmailReaderRequest = {
  since: "2026-10-29T12:00:00.000Z",
  until: "2026-11-05T12:00:00.000Z",
  limit: 5,
  signal: new AbortController().signal,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReadOnlyEmailReader mock contract", () => {
  it("returns bounded evidence labeled as synthetic mock data", async () => {
    const result = await createMockEmailReader({
      now: () => Date.parse(request.until),
    }).readRecentInbox(request);

    expect(result).toMatchObject({
      status: "ok",
      provider: "mock",
      sourceLabel: "Synthetic inbox",
      coverage: "complete",
      window: { since: request.since, until: request.until },
    });
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0]).toMatchObject({
      provider: "mock",
      source: {
        kind: "synthetic",
        label: "Synthetic inbox",
        reference: "synthetic-message-M01",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/accessToken|refresh_token|client_secret|connected/i);
  });

  it("performs no provider network requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await createMockEmailReader().readRecentInbox(request);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses a half-open seven-day UTC window and reports complete empty results truthfully", async () => {
    const result = await createMockEmailReader({
      messages: [
        { id: "lower-edge", receivedAt: request.since, body: "Synthetic lower edge." },
        { id: "upper-edge", receivedAt: request.until, body: "Outside the interval." },
      ],
    }).readRecentInbox(request);

    expect(result).toMatchObject({
      status: "ok",
      coverage: "complete",
      messages: [{ body: "Synthetic lower edge." }],
    });
    expect(await createMockEmailReader({ messages: [] }).readRecentInbox(request))
      .toMatchObject({ status: "empty", coverage: "complete", messages: [] });
  });
});
