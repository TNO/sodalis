import { Hono } from "hono";
import {
  createAssistantActionRuntime,
  type AppActionDefinition,
  type AppActionInputProperty,
} from "@sodalis/assistant";
import type { HomeClient } from "./client.js";

interface HomeAppOptions {
  readonly minTemperature?: number;
  readonly maxTemperature?: number;
}

interface HomeOperation {
  readonly id: string;
  readonly domain: string;
  readonly service: string;
  readonly value?: { readonly type: "number" | "string"; readonly field: string };
  readonly confirmation?: boolean;
}

const OPERATIONS: readonly HomeOperation[] = [
  { id: "home.light.turn-on", domain: "light", service: "turn_on" },
  { id: "home.light.turn-off", domain: "light", service: "turn_off" },
  { id: "home.light.brightness", domain: "light", service: "turn_on", value: { type: "number", field: "brightness_pct" } },
  { id: "home.fan.turn-on", domain: "fan", service: "turn_on" },
  { id: "home.fan.turn-off", domain: "fan", service: "turn_off" },
  { id: "home.fan.speed", domain: "fan", service: "set_percentage", value: { type: "number", field: "percentage" } },
  { id: "home.media-player.play", domain: "media_player", service: "media_play" },
  { id: "home.media-player.pause", domain: "media_player", service: "media_pause" },
  { id: "home.media-player.volume", domain: "media_player", service: "volume_set", value: { type: "number", field: "volume_level" } },
  { id: "home.climate.target-temperature", domain: "climate", service: "set_temperature", value: { type: "number", field: "temperature" } },
  { id: "home.climate.hvac-mode", domain: "climate", service: "set_hvac_mode", value: { type: "string", field: "hvac_mode" }, confirmation: true },
  { id: "home.script.run", domain: "script", service: "turn_on", confirmation: true },
  { id: "home.scene.activate", domain: "scene", service: "turn_on", confirmation: true },
  { id: "home.lock.lock", domain: "lock", service: "lock", confirmation: true },
  { id: "home.lock.unlock", domain: "lock", service: "unlock", confirmation: true },
  { id: "home.alarm.arm-away", domain: "alarm_control_panel", service: "alarm_arm_away", confirmation: true },
  { id: "home.alarm.disarm", domain: "alarm_control_panel", service: "alarm_disarm", confirmation: true },
  { id: "home.cover.open", domain: "cover", service: "open_cover", confirmation: true },
  { id: "home.cover.close", domain: "cover", service: "close_cover", confirmation: true },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createHomeApp(client: HomeClient, options: HomeAppOptions = {}) {
  const minTemperature = options.minTemperature ?? 16;
  const maxTemperature = options.maxTemperature ?? 26;
  if (!Number.isFinite(minTemperature) || !Number.isFinite(maxTemperature) ||
      minTemperature >= maxTemperature) {
    throw new Error("Home climate safe temperature range is invalid.");
  }
  const definitions: AppActionDefinition[] = OPERATIONS.map((operation) => {
    const properties: Record<string, AppActionInputProperty> = {
      entityId: { type: "string", maxLength: 128 },
    };
    if (operation.value) properties.value = { type: operation.value.type };
    return {
      id: operation.id,
      description: `${operation.service} on a ${operation.domain} entity.`,
      risk: operation.confirmation ? "external-effect" : "safe-control",
      requiresConfirmation: Boolean(operation.confirmation),
      inputSchema: {
        type: "object", properties,
        required: operation.value ? ["entityId", "value"] : ["entityId"],
        additionalProperties: false,
      },
      ...(operation.confirmation ? {
        confirmationPhrase: "confirm home action",
        confirmationSummary: (args: Readonly<Record<string, unknown>>) =>
          `${operation.id} on ${String(args.entityId)}${operation.value ? ` with ${String(args.value)}` : ""}?`,
      } : {}),
      execute: async (args: Readonly<Record<string, unknown>>) => {
        const entityId = String(args.entityId);
        const data: Record<string, string | number> = { entity_id: entityId };
        if (operation.value) {
          const value = args.value;
          data[operation.value.field] =
            operation.id === "home.media-player.volume"
              ? Number(value) / 100
              : operation.value.type === "number" ? Number(value) : String(value);
        }
        await client.callService(operation.domain, operation.service, data);
        return `${operation.id} completed for ${entityId}.`;
      },
    };
  });
  const runtime = createAssistantActionRuntime(definitions);
  const app = new Hono();

  app.get("/healthz", (context) => context.json({ status: "ok", service: "home" }));
  app.get("/readyz", async (context) => {
    try {
      await client.listEntities();
      return context.json({ status: "ready", service: "home" });
    } catch (error) {
      console.error("Home readiness failed:", error);
      return context.json({ error: "Home Assistant is unavailable." }, 503);
    }
  });
  app.get("/api/home/entities", async (context) => {
    const query = (context.req.query("q") ?? "").toLowerCase().trim();
    if (query.length > 200) return context.json({ error: "Search query is too long." }, 400);
    const entities = await client.listEntities();
    return context.json(entities.filter((entity) =>
      OPERATIONS.some((operation) => operation.domain === entity.domain) &&
      (!query || `${entity.name} ${entity.entityId}`.toLowerCase().includes(query))
    ));
  });
  app.get("/api/home/entities/:entityId", async (context) => {
    const entity = (await client.listEntities()).find(
      (item) => item.entityId === context.req.param("entityId") &&
        OPERATIONS.some((operation) => operation.domain === item.domain),
    );
    return entity ? context.json(entity) : context.json({ error: "Entity not found." }, 404);
  });
  app.get("/api/home/actions", (context) => context.json(runtime.getAvailableActions()));
  app.post("/api/home/actions", async (context) => {
    const payload: unknown = await context.req.json().catch(() => undefined);
    if (!isRecord(payload) || typeof payload.id !== "string" ||
        !isRecord(payload.arguments)) {
      return context.json({ error: "A valid home action is required." }, 400);
    }
    const operation = OPERATIONS.find((candidate) => candidate.id === payload.id);
    const args = payload.arguments;
    if (!operation || typeof args.entityId !== "string" ||
        !/^[a-z_]+\.[a-z0-9_]+$/.test(args.entityId) ||
        !args.entityId.startsWith(`${operation.domain}.`)) {
      return context.json({ error: "Home action or target is not allowed." }, 400);
    }
    const entity = (await client.listEntities()).find((item) => item.entityId === args.entityId);
    if (!entity || entity.domain !== operation.domain) {
      return context.json({ error: "Home entity is not available." }, 404);
    }
    if (operation.value?.type === "number") {
      const value = args.value;
      const minimum = operation.domain === "climate" ? minTemperature : 0;
      const maximum = operation.domain === "climate" ? maxTemperature : 100;
      if (typeof value !== "number" || !Number.isFinite(value) ||
          value < minimum || value > maximum ||
          (operation.domain !== "climate" && !Number.isInteger(value)) ||
          (operation.domain === "climate" && entity.attributes.temperature_unit !== "°C")) {
        return context.json({ error: "Home value is outside the safe range." }, 400);
      }
    }
    if (operation.id === "home.climate.hvac-mode" &&
        (typeof args.value !== "string" ||
          !Array.isArray(entity.attributes.hvac_modes) ||
          !entity.attributes.hvac_modes.includes(args.value))) {
      return context.json({ error: "HVAC mode is not supported by this entity." }, 400);
    }
    try {
      return context.json(await runtime.invoke({ id: payload.id, arguments: args }));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError ||
          (error instanceof Error && error.message.includes("pending"))) {
        return context.json({ error: error.message }, 400);
      }
      throw error;
    }
  });
  app.post("/api/home/confirm", async (context) => {
    const payload: unknown = await context.req.json().catch(() => undefined);
    if (!isRecord(payload) || typeof payload.confirmationId !== "string" ||
        Object.keys(payload).length !== 1) {
      return context.json({ error: "Only a confirmation ID is accepted." }, 400);
    }
    try {
      return context.json(await runtime.confirm(payload.confirmationId));
    } catch (error) {
      if (error instanceof Error && error.message === "No matching action confirmation is pending.") {
        return context.json({ error: error.message }, 400);
      }
      throw error;
    }
  });
  app.onError((error, context) => {
    console.error("Home API request failed:", error);
    return context.json({ error: "Home Assistant request failed." }, 502);
  });
  return app;
}
