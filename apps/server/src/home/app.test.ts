import { describe, expect, it, vi } from "vitest";
import { createHomeApp } from "./app.js";
import type { HomeClient, HomeEntity } from "./client.js";

const entities: HomeEntity[] = [
  { entityId: "light.bed_light", name: "Bed Light", domain: "light", state: "off", attributes: {} },
  { entityId: "fan.living_room_fan", name: "Living Room Fan", domain: "fan", state: "off", attributes: {} },
  { entityId: "media_player.walkman", name: "Walkman", domain: "media_player", state: "playing", attributes: {} },
  { entityId: "climate.hvac", name: "HVAC", domain: "climate", state: "cool", attributes: { temperature: 21, temperature_unit: "°C", hvac_modes: ["off", "cool", "heat"] } },
  { entityId: "lock.front_door", name: "Front Door", domain: "lock", state: "locked", attributes: {} },
];

function fixture() {
  const callService = vi.fn(async (_domain: string, _service: string, _data: Record<string, string | number>) => {});
  const client: HomeClient = {
    listEntities: async () => entities,
    callService,
  };
  return { app: createHomeApp(client), callService };
}
const json = (body: unknown) => ({
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("Home API and safe controls", () => {
  it("discovers and reads semantic entities and reports independent health", async () => {
    const { app } = fixture();
    expect((await (await app.request("/api/home/entities?q=bed")).json())).toEqual([entities[0]]);
    expect((await (await app.request("/api/home/entities/light.bed_light")).json())).toEqual(entities[0]);
    expect((await app.request("/healthz")).status).toBe(200);
    expect((await app.request("/readyz")).status).toBe(200);
  });

  it("executes bounded basic controls without confirmation", async () => {
    const { app, callService } = fixture();
    const commands = [
      ["home.light.turn-on", "light.bed_light", { entity_id: "light.bed_light" }, "light", "turn_on"],
      ["home.light.brightness", "light.bed_light", { entity_id: "light.bed_light", brightness_pct: 70 }, "light", "turn_on", 70],
      ["home.fan.speed", "fan.living_room_fan", { entity_id: "fan.living_room_fan", percentage: 35 }, "fan", "set_percentage", 35],
      ["home.media-player.pause", "media_player.walkman", { entity_id: "media_player.walkman" }, "media_player", "media_pause"],
      ["home.media-player.volume", "media_player.walkman", { entity_id: "media_player.walkman", volume_level: 0.4 }, "media_player", "volume_set", 40],
      ["home.climate.target-temperature", "climate.hvac", { entity_id: "climate.hvac", temperature: 22 }, "climate", "set_temperature", 22],
    ] as const;
    for (const [id, entityId, , , , value] of commands) {
      const response = await app.request("/api/home/actions", json({
        id, arguments: { entityId, ...(value === undefined ? {} : { value }) },
      }));
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe("completed");
    }
    expect(callService.mock.calls.map(([domain, service, data]) => [domain, service, data])).toEqual(
      commands.map(([, , data, domain, service]) => [domain, service, data]),
    );
  });

  it("rejects unsafe values and unknown operations without reaching Home Assistant", async () => {
    const { app, callService } = fixture();
    for (const action of [
      { id: "home.light.brightness", arguments: { entityId: "light.bed_light", value: 101 } },
      { id: "home.climate.target-temperature", arguments: { entityId: "climate.hvac", value: 30 } },
      { id: "home.climate.target-temperature", arguments: { entityId: "climate.hvac", value: 20, hvacMode: "heat" } },
      { id: "home.lock.unlock", arguments: { entityId: "light.bed_light" } },
      { id: "home.unknown.run", arguments: { entityId: "lock.front_door" } },
    ]) {
      expect((await app.request("/api/home/actions", json(action))).status).toBe(400);
    }
    expect(callService).not.toHaveBeenCalled();
  });

  it("binds consequential control to its exact target and confirmation ID", async () => {
    const { app, callService } = fixture();
    const pending = await (await app.request("/api/home/actions", json({
      id: "home.lock.unlock", arguments: { entityId: "lock.front_door" },
    }))).json() as { status: string; pending: { id: string } };
    expect(pending.status).toBe("confirmation-required");
    expect(callService).not.toHaveBeenCalled();
    expect((await app.request("/api/home/confirm", json({ confirmationId: "stale" }))).status).toBe(400);
    expect((await app.request("/api/home/confirm", json({
      confirmationId: pending.pending.id, entityId: "light.bed_light",
    }))).status).toBe(400);
    expect((await app.request("/api/home/confirm", json({ confirmationId: pending.pending.id }))).status).toBe(200);
    expect(callService).toHaveBeenCalledWith("lock", "unlock", { entity_id: "lock.front_door" });
    expect((await app.request("/api/home/confirm", json({ confirmationId: pending.pending.id }))).status).toBe(400);
  });

  it("requires confirmation for HVAC mode changes and rejects accidental yes", async () => {
    const { app, callService } = fixture();
    const response = await app.request("/api/home/actions", json({
      id: "home.climate.hvac-mode",
      arguments: { entityId: "climate.hvac", value: "heat" },
    }));
    const pending = await response.json() as {
      status: string; pending: { id: string; summary: string };
    };
    expect(pending.status).toBe("confirmation-required");
    expect(pending.pending.summary).toContain("climate.hvac with heat");
    expect(callService).not.toHaveBeenCalled();
    expect((await app.request("/api/home/confirm", json({ confirmationId: "yes" }))).status).toBe(400);
    await app.request("/api/home/confirm", json({ confirmationId: pending.pending.id }));
    expect(callService).toHaveBeenCalledWith("climate", "set_hvac_mode", {
      entity_id: "climate.hvac", hvac_mode: "heat",
    });
  });
});
