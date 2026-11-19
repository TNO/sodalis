import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeSimulatorBridge } from "./homeSimulator.js";
import { createHomeTools } from "./tools.js";
import { fakeHomeSimulator, SIMULATION_TIME } from "./homeSimulator.test-support.js";

const open: Awaited<ReturnType<typeof fakeHomeSimulator>>[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((bridge) => bridge.close()));
  vi.restoreAllMocks();
});
async function setup() {
  const endpoint = await fakeHomeSimulator();
  open.push(endpoint);
  const bridge = new HomeSimulatorBridge(endpoint.url);
  const simulationTime = await bridge.readClock();
  const budget = { onUnproductive: vi.fn() };
  return { ...endpoint, bridge, budget, tools: createHomeTools({ simulator: { bridge, simulationTime }, budget }) };
}
async function call(tools: ReturnType<typeof createHomeTools>, name: string, params: object = {}, signal?: AbortSignal) {
  const tool = tools.find((candidate) => candidate.name === name)!;
  const result = await tool.execute("call", params as never, signal, undefined, undefined as never);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

describe("Home Simulator assistant tools", () => {
  it("offers only five read-only capabilities and clamps sensor reads to the replay clock", async () => {
    const h = await setup();
    expect(h.tools.map(({ name }) => name)).toEqual([
      "query_sensor_data", "get_context", "query_ontology", "query_weather", "get_agenda",
    ]);
    expect(await call(h.tools, "query_sensor_data", {
      sensor_uri: "https://example.org/door", property: "DoorOpen",
      start: "2025-02-15T08:30:00Z", end: "2030-01-01T00:00:00Z", limit: 10,
    })).toMatchObject({ status: "ok", events: [{ value: true }], through: SIMULATION_TIME, truncated: false });
    expect(h.requests).toEqual([
      { method: "GET", path: "/clock", body: {} },
      { method: "POST", path: "/tools/query_sensor_data", body: {
        sensor_uri: "https://example.org/door", property: "DoorOpen", start: "2025-02-15T08:30:00Z",
        end: SIMULATION_TIME, limit: 10,
      } },
    ]);
  });

  it.each([
    ["query_sensor_data", {}, { events: [{ value: 19.2 }], through: SIMULATION_TIME, has_more: true, next_after_sequence: 50, clock: "received_at" }, "events"],
    ["get_context", { entity_uri: "https://example.org/room" }, { entity: "https://example.org/room", properties: [{ predicate: "label", value: "Kitchen" }], has_more: true, next_offset: 50, inference: "none" }, "properties"],
    ["query_ontology", { query: "SELECT ?s WHERE { ?s ?p ?o }" }, { variables: ["s"], rows: [{ s: { value: "Kitchen", kind: "literal" } }], has_more: true, inference: "none", view: "context" }, "rows"],
    ["query_weather", { kind: "forecast", offset: 2 }, { rows: [{ temperature_c: 12 }], as_of: SIMULATION_TIME, has_more: true, next_offset: 52 }, "rows"],
    ["get_agenda", { offset: 1 }, { events: [{ activity: "exercise", start: "2025-02-15T11:00:00+01:00" }], as_of: SIMULATION_TIME, has_more: true, next_offset: 51 }, "events"],
  ] as const)("returns bounded native %s evidence, retaining clock and paging metadata", async (name, args, reply, field) => {
    const h = await setup();
    const row = "rows" in reply ? reply.rows[0] : "events" in reply ? reply.events[0] : reply.properties[0];
    h.replies.set(`/tools/${name}`, { body: {
      ...reply,
      [field]: Array.from({ length: 60 }, () => ({ ...row, note: "☀".repeat(2_000) })),
    } });
    const result = await call(h.tools, name, args);
    expect(result).toMatchObject({ status: "ok", truncated: true, has_more: true });
    expect((result[field] as unknown[]).length).toBeGreaterThan(0);
    expect((result[field] as unknown[]).length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(16_000);
    expect(JSON.stringify(result)).not.toContain("☀".repeat(1_001));
    if ("as_of" in reply) expect(result.as_of).toBe(SIMULATION_TIME);
    expect(h.requests.at(-1)).toMatchObject({ method: "POST", path: `/tools/${name}`, body: { ...args, limit: 50 } });
  });

  it("keeps whole sensor events and a usable continuation cursor when a full page exceeds the result budget", async () => {
    const h = await setup();
    const events = Array.from({ length: 50 }, (_, index) => ({
      event_id: `event-${index}`, run_id: "run-3a9a428144bdbfa4",
      timestamp: "2025-02-15T00:00:00+01:00", received_at: "2025-02-15T00:00:00+01:00",
      sensor_uri: "https://example.org/regiodeal/resource/apartment-v1/temp-hum",
      target_uri: "https://example.org/regiodeal/resource/apartment-v1/bathroom",
      property: "Temperature", event_type: "measurement", value: 19.5, unit: "celsius",
      series: "couple-apartment/temp-hum/Temperature", synthetic: true, sequence: 1_000 + index,
    }));
    h.replies.set("/tools/query_sensor_data", { body: {
      events, has_more: true, next_after_sequence: 1_049, through: SIMULATION_TIME, clock: "received_at",
    } });
    const result = await call(h.tools, "query_sensor_data");
    const visible = result.events as { sequence?: number; unit?: string }[];
    expect(visible.length).toBeLessThan(50);
    expect(visible.every((event) => event.unit === "celsius" && event.sequence !== undefined)).toBe(true);
    expect(result).toMatchObject({ has_more: true, truncated: true, next_after_sequence: visible.at(-1)!.sequence });
  });

  it.each([
    ["query_sensor_data", { limit: 51 }],
    ["get_context", { entity_uri: "https://example.org/room", offset: -1 }],
    ["query_ontology", { query: "ASK { ?s ?p ?o }", limit: 1.5 }],
    ["query_weather", { kind: "future" }],
    ["get_agenda", { tool: "acknowledge_batch", url: "https://elsewhere.test/" }],
    ["query_sensor_data", { start: "2025-02-15T08:30:00" }],
    ["query_sensor_data", { start: "2030-01-01T00:00:00Z" }],
  ] as const)("rejects invalid %s arguments without making a bridge tool request", async (name, args) => {
    const h = await setup();
    expect(await call(h.tools, name, args)).toMatchObject({ status: "invalid_arguments" });
    expect(h.requests.map(({ path }) => path)).toEqual(["/clock"]);
  });

  it("surfaces simulator refusals as invalid arguments, including read-only ontology errors", async () => {
    const h = await setup();
    const reason = "Only local SELECT and ASK queries are supported.";
    h.replies.set("/tools/query_ontology", { status: 422, body: { error: reason } });
    expect(await call(h.tools, "query_ontology", { query: "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }" }))
      .toEqual({ status: "invalid_arguments", reason });
    h.replies.set("/tools/query_sensor_data", { status: 422, body: { error: "Query end cannot exceed the session observation clock." } });
    expect(await call(h.tools, "query_sensor_data")).toMatchObject({ status: "invalid_arguments", reason: expect.stringContaining("clock") });
  });

  it.each([
    { status: 503, body: { error: "unavailable" } },
    { body: "not json", raw: true },
    { body: null },
    { body: { unexpected: [] } },
    { body: { events: ["not an event"], has_more: false, through: SIMULATION_TIME } },
    { status: 302, body: {}, headers: { location: "/tools/get_session" } },
  ])("reports an unavailable Home Simulator for failed or malformed bridge replies: %j", async (reply) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = await setup();
    h.replies.set("/tools/query_sensor_data", reply);
    expect(await call(h.tools, "query_sensor_data")).toMatchObject({ status: "unavailable", reason: expect.stringContaining("Home Simulator") });
    h.replies.set("/tools/get_agenda", reply);
    expect(await call(h.tools, "get_agenda")).toMatchObject({ status: "unavailable" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(h.requests.map(({ path }) => path)).toEqual(["/clock", "/tools/query_sensor_data", "/tools/get_agenda"]);
  });

  it("reports connection refusal and timeouts as unavailable and honors cancellation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = await setup();
    h.replies.set("/tools/get_agenda", { body: {}, hang: true });
    expect(await call(h.tools, "get_agenda")).toMatchObject({ status: "unavailable", reason: "timeout" });
    const controller = new AbortController();
    const pending = call(h.tools, "get_agenda", { limit: 1 }, controller.signal);
    controller.abort(new Error("Resident cancelled"));
    await expect(pending).rejects.toThrow("Resident cancelled");
    await h.close();
    expect(await call(h.tools, "query_sensor_data")).toMatchObject({ status: "unavailable" });
  }, 10_000);

  it("does not invent a clock or query any tools when the clock is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = await setup();
    h.replies.set("/clock", { body: { simulationTime: "not a timestamp" } });
    const simulationTime = await h.bridge.readClock();
    expect(simulationTime).toBeUndefined();
    const tools = createHomeTools({ simulator: { bridge: h.bridge, simulationTime }, budget: h.budget });
    expect(await call(tools, "query_sensor_data")).toMatchObject({ status: "unavailable" });
    expect(h.requests.map(({ path }) => path)).toEqual(["/clock", "/clock"]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    ["query_sensor_data", {}, { events: [], has_more: false, next_after_sequence: 0, through: SIMULATION_TIME, clock: "received_at" }],
    ["get_context", {}, { entities: [], has_more: false, next_offset: 0, inference: "none" }],
    ["query_ontology", { query: "SELECT ?s WHERE { ?s ?p ?o }" }, { rows: [], variables: ["s"], has_more: false, inference: "none", view: "context" }],
    ["query_weather", {}, { rows: [], has_more: false, as_of: SIMULATION_TIME }],
    ["get_agenda", {}, { events: [], has_more: false, as_of: SIMULATION_TIME }],
  ] as const)("distinguishes empty %s evidence from an unavailable bridge", async (name, args, body) => {
    const h = await setup();
    h.replies.set(`/tools/${name}`, { body });
    expect(await call(h.tools, name, args)).toMatchObject({ status: "no_data", truncated: false });
  });

  it("clamps future sensor ends at sub-millisecond replay precision and retains earlier ends", async () => {
    const h = await setup();
    const simulationTime = "2025-02-14T22:59:59.999998+00:00";
    const tools = createHomeTools({ simulator: { bridge: h.bridge, simulationTime }, budget: h.budget });
    await call(tools, "query_sensor_data", { end: "2025-02-14T23:59:59.999999+01:00" });
    expect(h.requests.at(-1)?.body.end).toBe(simulationTime);
    await call(tools, "query_sensor_data", { end: "2025-02-14T23:59:59.999997+01:00" });
    expect(h.requests.at(-1)?.body.end).toBe("2025-02-14T23:59:59.999997+01:00");
    await call(tools, "query_sensor_data");
    expect(h.requests.at(-1)?.body.end).toBe(simulationTime);
    expect(await call(tools, "query_sensor_data", { start: "2025-02-14T22:59:59.999999Z" }))
      .toMatchObject({ status: "invalid_arguments" });
  });

  it("keeps continuation cursors at the last visible row when a result is truncated", async () => {
    const h = await setup();
    h.replies.set("/tools/query_sensor_data", { body: {
      events: Array.from({ length: 60 }, (_, index) => ({ sequence: index + 1, value: "x".repeat(2_000) })),
      has_more: false, next_after_sequence: 60, through: SIMULATION_TIME, clock: "received_at",
    } });
    const sensors = await call(h.tools, "query_sensor_data");
    const events = sensors.events as { sequence: number }[];
    expect(sensors).toMatchObject({ status: "ok", truncated: true, has_more: true, next_after_sequence: events.at(-1)!.sequence });
    h.replies.set("/tools/get_context", { body: {
      entities: Array.from({ length: 60 }, (_, index) => ({ uri: `https://example.org/${index}`, name: "x".repeat(2_000) })),
      has_more: false, next_offset: 70, inference: "none",
    } });
    const context = await call(h.tools, "get_context", { offset: 10 });
    expect(context).toMatchObject({ has_more: true, truncated: true, next_offset: 10 + (context.entities as unknown[]).length });
  });

  it("reuses equivalent tool reads and charges the existing unproductive-call budget", async () => {
    const h = await setup();
    const first = await call(h.tools, "query_sensor_data", { limit: 10, property: "DoorOpen" });
    for (let index = 0; index < 3; index += 1) {
      expect(await call(h.tools, "query_sensor_data", { property: "DoorOpen", limit: 10 })).toMatchObject({ repeated: true, result: first });
    }
    expect(h.requests.map(({ path }) => path)).toEqual(["/clock", "/tools/query_sensor_data"]);
    expect(h.budget.onUnproductive).toHaveBeenCalledOnce();
  });

  it("retains negative ontology ASK answers as evidence, not missing data", async () => {
    const h = await setup();
    h.replies.set("/tools/query_ontology", { body: { boolean: false, inference: "none", view: "context" } });
    expect(await call(h.tools, "query_ontology", { query: "ASK { ?s ?p ?o }" })).toMatchObject({ status: "ok", boolean: false });
  });

  it("refuses oversized HTTP replies instead of flooding the model", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = await setup();
    h.replies.set("/tools/get_agenda", { body: { events: [{ activity: "x".repeat(1_048_576) }], as_of: SIMULATION_TIME, has_more: false } });
    expect(await call(h.tools, "get_agenda")).toMatchObject({ status: "unavailable" });
  });

});
