import { describe, expect, it, vi } from "vitest";
import { HomeAssistantClient } from "./client.js";

describe("Home Assistant Core adapter", () => {
  it("reads typed demo entities and calls only the specified service with server credentials", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) =>
      Response.json(init.method === "POST" ? [] : [{
        entity_id: "light.bed_light", state: "off",
        attributes: { friendly_name: "Bed Light" },
      }]));
    const client = new HomeAssistantClient({
      baseUrl: "http://homeassistant:8123",
      token: "test-token",
      fetch: fetcher as typeof fetch,
    });
    expect(await client.listEntities()).toEqual([{
      entityId: "light.bed_light", domain: "light", name: "Bed Light",
      state: "off", attributes: { friendly_name: "Bed Light" },
    }]);
    await client.callService("light", "turn_on", { entity_id: "light.bed_light" });
    expect(fetcher.mock.calls[1]?.[0].toString()).toBe("http://homeassistant:8123/api/services/light/turn_on");
    expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({
      authorization: "Bearer test-token",
    });
  });

  it("rejects missing tokens and unavailable Home Assistant instances", async () => {
    expect(() => new HomeAssistantClient({
      baseUrl: "http://localhost:8123", token: "",
    })).toThrow("HOME_ASSISTANT_TOKEN");
    const client = new HomeAssistantClient({
      baseUrl: "http://localhost:8123", token: "test-token",
      fetch: async () => new Response(null, { status: 503 }),
    });
    await expect(client.listEntities()).rejects.toThrow("HTTP 503");
  });
});
