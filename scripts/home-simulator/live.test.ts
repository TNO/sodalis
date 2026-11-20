import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { advanceReplay } from "./advance.js";
import { startHomeSimulatorBridge } from "./bridge.js";
import { createReplaySession } from "./session.js";

// Opt-in against a real checkout; never set in CI. Needs no cloud credentials.
// It reuses or generates the scenario's dataset in the checkout's own git-ignored output/ directory.
const root = process.env.HOME_SIMULATOR_ROOT?.trim();

describe.skipIf(!root)("Home Simulator through a real checkout (HOME_SIMULATOR_ROOT)", () => {
  let directory: string | undefined;
  afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

  it("opens a replay session, serves the five read tools and the clock, and advances once", async () => {
    directory = mkdtempSync(resolve(".test-home-simulator-live-"));
    const handoffPath = resolve(directory, "session.json");
    const handoff = await createReplaySession({ root: root!, handoffPath });
    expect(handoff.stateDir).toBe(resolve(root!, "output", "tool-service"));
    const bridge = await startHomeSimulatorBridge({ handoff, host: "127.0.0.1", port: 0 });
    try {
      const get = async (path: string) => (await fetch(`${bridge.url}${path}`)).json() as Promise<Record<string, any>>;
      const tool = async (name: string, args: object = {}) => {
        const response = await fetch(`${bridge.url}/tools/${name}`, { method: "POST", body: JSON.stringify(args) });
        expect(response.status, name).toBe(200);
        return await response.json() as Record<string, any>;
      };

      const start = (await get("/clock")).simulationTime as string;
      expect(Date.parse(start)).toBeLessThan(Date.parse("2025-02-15T00:00:00Z"));
      expect(await tool("query_sensor_data", { limit: 5 })).toMatchObject({ events: [], has_more: false });
      expect(await tool("query_weather", { limit: 5 })).toMatchObject({ rows: [] });
      expect(await tool("get_agenda", { limit: 5 })).toMatchObject({ events: [] });
      const context = await tool("get_context", { limit: 5 });
      expect(context.entities.length).toBeGreaterThan(0);
      const ontology = await tool("query_ontology", { query: "SELECT ?s WHERE { ?s ?p ?o } LIMIT 3", limit: 3 });
      expect(ontology).toMatchObject({ variables: ["s"], view: "context" });
      expect(ontology.rows.length).toBeGreaterThan(0);
      const refused = await fetch(`${bridge.url}/tools/query_ontology`, {
        method: "POST", body: JSON.stringify({ query: "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }" }),
      });
      expect(refused.status).toBe(422);

      const result = await advanceReplay({ handoffPath });
      expect(result.status).toBe("advanced");
      expect(Date.parse((await get("/clock")).simulationTime)).toBeGreaterThan(Date.parse(start));
      const sensors = await tool("query_sensor_data", { limit: 5 });
      expect(sensors.events.length).toBeGreaterThan(0);
      expect(Date.parse(sensors.through)).toBe(Date.parse((await get("/clock")).simulationTime));
    } finally {
      await bridge.close();
    }
  }, 180_000);
});
