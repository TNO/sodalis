import { describe, expect, it, vi } from "vitest";
import { readAssistantMode } from "./assistantMode.js";

describe("assistant runtime mode", () => {
  it.each(["turn", "workflow"] as const)("reads %s from the configured server without caching", async (mode) => {
    const fetch = vi.fn(async () => Response.json({ mode }));
    expect(await readAssistantMode({ baseUrl: "https://sodalis.test/api/", fetch })).toBe(mode);
    expect(fetch).toHaveBeenCalledWith(
      "https://sodalis.test/api/assistant/config",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it.each([{}, null, { mode: "pi" }, { mode: "unknown" }])("rejects malformed configuration %j", async (value) => {
    await expect(readAssistantMode({ fetch: async () => Response.json(value) })).rejects.toThrow("invalid mode");
  });

  it("reports HTTP and network errors rather than falling back to turn mode", async () => {
    await expect(readAssistantMode({
      fetch: async () => new Response(null, { status: 404 }),
    })).rejects.toThrow("HTTP 404");
    await expect(readAssistantMode({
      fetch: async () => { throw new Error("offline"); },
    })).rejects.toThrow("offline");
  });

  it("propagates cancellation to discovery", async () => {
    const abort = new AbortController();
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      abort.abort();
      init?.signal?.throwIfAborted();
      return Response.json({ mode: "turn" });
    });
    await expect(readAssistantMode({ fetch, signal: abort.signal })).rejects.toThrow();
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
