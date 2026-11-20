import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveBridgeHost, startHomeSimulatorBridge } from "./bridge.js";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function start() {
  const root = mkdtempSync(resolve(".test-home-simulator-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(resolve(root, "fixture.json"), JSON.stringify({
    sessions: { "session-test": { session_id: "session-test", simulation_time: "2025-02-15T09:30:00+00:00" } },
  }));
  const warnings: string[] = [];
  const bridge = await startHomeSimulatorBridge({
    handoff: { root, stateDir: root, sessionId: "session-test", datasetId: "dataset-test", scenario: "avatar-support" },
    host: "127.0.0.1", port: 0, warn: (message) => warnings.push(message),
    launch: { command: process.execPath, args: [resolve("scripts/home-simulator/fixtures/mcp-server.mjs")] },
  });
  cleanups.push(bridge.close);
  return { ...bridge, warnings };
}

it("serves health, the replay clock, and exactly the five read-only avatar tools", async () => {
  const bridge = await start();
  expect(await (await fetch(`${bridge.url}/health`)).json()).toEqual({ ok: true });
  expect(await (await fetch(`${bridge.url}/clock`)).json()).toEqual({ simulationTime: "2025-02-15T09:30:00+00:00" });
  const cases = [
    { tool: "query_sensor_data", args: { after_sequence: 3 }, expected: {
      events: [], has_more: false, next_after_sequence: 3, through: "2025-02-15T09:30:00+00:00", clock: "received_at",
    } },
    { tool: "get_context", args: { limit: 3 }, expected: { entities: [], has_more: false, next_offset: null, inference: "none" } },
    { tool: "query_ontology", args: { query: "ASK { ?s ?p ?o }" }, expected: { boolean: true, inference: "none", view: "context" } },
    { tool: "query_weather", args: { kind: "forecast" }, expected: {
      rows: [], has_more: false, next_offset: null, withheld_unknown_issue_time: 0, as_of: "2025-02-15T09:30:00+00:00",
    } },
    { tool: "get_agenda", args: { limit: 3 }, expected: {
      events: [], has_more: false, next_offset: null, availability_basis: "declared_agenda_at_start_of_each_local_day", as_of: "2025-02-15T09:30:00+00:00",
    } },
  ];
  for (const { tool, args, expected } of cases) {
    const response = await fetch(`${bridge.url}/tools/${tool}`, { method: "POST", body: JSON.stringify(args) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  }
  for (const tool of ["next_interaction_batch", "acknowledge_batch", "parse_claims", "get_session",
    "list_setups", "list_scenarios", "get_scenario", "save_scenario", "generate_dataset", "get_job",
    "cancel_job", "register_dataset", "list_datasets", "open_session", "unknown"]) {
    expect((await fetch(`${bridge.url}/tools/${tool}`, { method: "POST", body: "{}" })).status).toBe(404);
  }
  expect((await fetch(`${bridge.url}/unknown`)).status).toBe(404);
  expect((await fetch(`${bridge.url}/tools/get_context`)).status).toBe(405);
  expect((await fetch(`${bridge.url}/clock`, { method: "POST" })).status).toBe(405);
});

it("reports avatar tool-level errors as 422 JSON rather than successful data", async () => {
  const bridge = await start();
  const response = await fetch(`${bridge.url}/tools/query_sensor_data`, {
    method: "POST", body: JSON.stringify({ end: "2099-01-01T00:00:00Z" }),
  });
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "Query end cannot exceed the session observation clock." });
});

it("warns on a dead avatar child and returns unavailable for subsequent requests including health", async () => {
  const bridge = await start();
  const response = await fetch(`${bridge.url}/tools/get_context`, { method: "POST", body: '{"fixtureExit":true}' });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
  await expect.poll(() => bridge.warnings.join("\n")).toMatch(/Home Simulator.*unavailable/);
  for (const [path, method] of [["/health", "GET"], ["/clock", "GET"], ["/tools/get_agenda", "POST"]]) {
    const response = await fetch(`${bridge.url}${path}`, { method, ...(method === "POST" ? { body: "{}" } : {}) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  }
});

it("rejects malformed, non-object and oversized argument bodies without calling a tool", async () => {
  const bridge = await start();
  for (const body of ["{", "[]", "null", "42"]) {
    const response = await fetch(`${bridge.url}/tools/get_context`, { method: "POST", body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Expected a JSON object." });
  }
  const response = await fetch(`${bridge.url}/tools/get_context`, { method: "POST", body: "x".repeat(1_048_577) });
  expect(response.status).toBe(413);
  expect((await fetch(`${bridge.url}/health`)).status).toBe(200);
});

it("chooses a container-reachable Linux default only when that bridge address exists and refuses non-private binds", () => {
  expect(resolveBridgeHost("", { platform: "linux", addresses: ["127.0.0.1", "172.17.0.1"] })).toBe("172.17.0.1");
  expect(resolveBridgeHost("", { platform: "linux", addresses: ["127.0.0.1", "192.168.1.1"] })).toBe("127.0.0.1");
  expect(resolveBridgeHost("", { platform: "darwin", addresses: ["172.17.0.1"] })).toBe("127.0.0.1");
  expect(resolveBridgeHost("", { platform: "linux", addresses: ["127.0.0.1", "172.19.0.1"], gateway: "172.19.0.1" })).toBe("172.19.0.1");
  expect(resolveBridgeHost("", { platform: "linux", addresses: ["127.0.0.1"], gateway: "172.19.0.1" })).toBe("172.19.0.1");
  expect(resolveBridgeHost("192.168.1.2")).toBe("192.168.1.2");
  expect(resolveBridgeHost("::1")).toBe("::1");
  for (const host of ["0.0.0.0", "::", "[::]", "*", "8.8.8.8", "host.example", "0", "127.1"]) {
    expect(() => resolveBridgeHost(host)).toThrow(/HOME_SIMULATOR_BRIDGE_HOST.*private/);
  }
});
