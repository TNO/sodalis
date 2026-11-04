import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteReadingsReader } from "./externalData.js";
import { Neo4jHomeGraph } from "./homeGraph.js";

/**
 * Direct checks against a Neo4j database holding the `home_simulator`
 * readable import (no model calls). Skipped unless HOME_GRAPH_TEST_URL and
 * HOME_GRAPH_TEST_PASSWORD are set; never runs in CI. Optionally set
 * HOME_DATA_TEST_SQLITE to the matching readings file, such as the test
 * container's `testdata/neo4j-test/timeseries.sqlite`.
 */
const url = process.env.HOME_GRAPH_TEST_URL;
const password = process.env.HOME_GRAPH_TEST_PASSWORD;
const sqlite = process.env.HOME_DATA_TEST_SQLITE;
const ENDPOINT = "local://simulation/timeseries.sqlite";
const RESOURCE = "https://example.org/regiodeal/resource/";

describe.skipIf(!url || !password)("home graph against the simulator import", () => {
  const reader = sqlite ? new SqliteReadingsReader({ endpoint: ENDPOINT, file: sqlite }) : undefined;
  let graph: Neo4jHomeGraph;
  beforeAll(() => {
    graph = new Neo4jHomeGraph({
    url: url!,
    user: process.env.HOME_GRAPH_TEST_USER ?? "neo4j",
    password: password!,
    scope: process.env.HOME_GRAPH_TEST_SCOPE ?? "cphs:simulation:couple-apartment",
      isReadable: (adapter, endpoint) => reader?.isReadable(adapter, endpoint) ?? false,
    });
  });
  afterAll(() => graph?.close());

  it("warms up and finds rooms by English and Dutch names", async () => {
    await graph.warmUp();
    const living = await graph.findEntities({ query: "living room" });
    expect(living.status === "ok" && living.candidates[0]?.id).toBe(`${RESOURCE}apartment-v1/living`);
    const woonkamer = await graph.findEntities({ query: "woonkamer", kind: "room" });
    expect(woonkamer.status === "ok" && woonkamer.candidates.map((entity) => entity.id)).toEqual([`${RESOURCE}apartment-v1/living`]);
  });

  it("reports ambiguity between the two bedrooms", async () => {
    const bedrooms = await graph.findEntities({ query: "bedroom", kind: "room" });
    expect(bedrooms.status).toBe("ambiguous");
  });

  it("never returns health or profile records", async () => {
    const robin = await graph.inspectNeighborhood({ entityIds: [`${RESOURCE}robin`], depth: 2 });
    expect(JSON.stringify(robin)).not.toMatch(/HealthRecord|PersonalityProfile|ProfileGeography/);
    expect(await graph.findEntities({ query: "health record" })).toEqual({ status: "not_found" });
  });

  it("shows the heater's configured state and no live state reference", async () => {
    const living = await graph.inspectNeighborhood({ entityIds: [`${RESOURCE}apartment-v1/living`] });
    expect(living.status).toBe("ok");
    if (living.status !== "ok") return;
    expect(living.entities.find((entity) => entity.name === "Heater")).toMatchObject({ configuredState: "off" });
    expect(living.externalData.some((reference) => reference.ownerIds.includes(`${RESOURCE}apartment-v1/heater`))).toBe(false);
  });

  it("finds the temperature sensor's references and reads the supported one", async () => {
    const sensor = await graph.inspectNeighborhood({ entityIds: [`${RESOURCE}apartment-v1/temp-hum`] });
    expect(sensor.status).toBe("ok");
    if (sensor.status !== "ok") return;
    const temperature = sensor.externalData.find((reference) => reference.id.endsWith("temp-hum/Temperature"));
    const unsupported = sensor.externalData.find((reference) => reference.id.endsWith("bedroom-temperature-db"));
    expect(unsupported?.readable).toBe(false);
    expect(temperature?.readable).toBe(Boolean(reader));
    const resolved = await graph.resolveReference(temperature!.id);
    expect(resolved).toMatchObject({ status: "ok", reference: { adapter: "sqlite", endpoint: ENDPOINT } });
    if (reader && resolved.status === "ok") {
      expect(await reader.read(resolved.reference, undefined)).toMatchObject({ status: "ok", unit: "degree Celsius" });
    }
  });
});
