import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SqliteReadingsReader } from "./externalData.js";
import type { HomeGraph, ResolvedReference } from "./homeGraph.js";
import { createHomeTools } from "./tools.js";

const ENDPOINT = "local://simulation/timeseries.sqlite";
const NOW = Date.parse("2026-10-19T12:05:00+02:00");
let directory: string;
let file: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "sodalis-readings-"));
  file = join(directory, "timeseries.sqlite");
  const database = new DatabaseSync(file);
  database.exec(
    "CREATE TABLE readings (series TEXT, timestamp TEXT, sensor TEXT, property TEXT, value REAL, target TEXT, event_type TEXT, received_at TEXT, run_id TEXT, event_id TEXT, PRIMARY KEY(series,timestamp))",
  );
  const insert = database.prepare("INSERT INTO readings (series, timestamp, property, value, event_type) VALUES (?, ?, ?, ?, ?)");
  const local = (minute: number) =>
    `2026-10-19T${String(11 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00+02:00`;
  for (let minute = 0; minute <= 60; minute += 1) {
    insert.run("temp", local(minute), "Temperature", 19 + minute / 60, "measurement");
  }
  insert.run("presence", "2026-10-19T08:00:00+02:00", "Presence", 1, "presence_detected");
  database.close();
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function reference(overrides: Partial<ResolvedReference> = {}): ResolvedReference {
  return {
    id: "ref/temp",
    name: "Temperature history",
    resource: "temp",
    adapter: "sqlite",
    endpoint: ENDPOINT,
    reporting: "periodic",
    capabilities: [{ id: "sensor/measurement/Temperature", unit: "degree Celsius" }],
    ...overrides,
  };
}

function reader(now = NOW, path = file) {
  return new SqliteReadingsReader({ endpoint: ENDPOINT, file: path, now: () => now });
}

describe("SQLite readings reader", () => {
  it("returns the latest timestamped measurement with the capability unit", async () => {
    expect(await reader().read(reference(), undefined)).toMatchObject({
      status: "ok",
      unit: "degree Celsius",
      latest: { value: 20, observedAt: "2026-10-19T12:00:00+02:00" },
      freshness: "current",
      ageMinutes: 5,
    });
  });

  it("distinguishes stale measurements and state-change series", async () => {
    expect(await reader(NOW + 60 * 60_000).read(reference(), undefined)).toMatchObject({ freshness: "stale", ageMinutes: 65 });
    expect(
      await reader().read(reference({ resource: "presence", reporting: "state_changes" }), undefined),
    ).toMatchObject({ freshness: "last_change", latest: { value: 1, event: "presence_detected" } });
  });

  it("summarises a bounded time range with capped samples", async () => {
    const result = await reader().read(reference(), {
      start: "2026-10-19T09:30:00Z",
      end: "2026-10-19T10:00:00Z",
    });
    expect(result.status === "ok" && result.range).toMatchObject({ count: 30, min: 19.5, max: 19.98, truncated: true });
    expect(result.status === "ok" && result.range?.samples.length).toBeLessThanOrEqual(12);
  });

  it("separates missing data, unsupported sources and unreachable sources", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reader().read(reference({ resource: "unknown" }), undefined)).toMatchObject({ status: "no_data" });
    expect(await reader().read(reference({ adapter: "timeseries", endpoint: "https://timeseries.example.org/query" }), undefined))
      .toEqual({ status: "unavailable", referenceId: "ref/temp", reason: "unsupported_source" });
    expect(await reader(NOW, join(directory, "missing.sqlite")).read(reference(), undefined))
      .toEqual({ status: "unavailable", referenceId: "ref/temp", reason: "source_unreachable" });
  });

  it("only accepts the configured endpoint", () => {
    expect(reader().isReadable("sqlite", ENDPOINT)).toBe(true);
    expect(reader().isReadable("sqlite", "local://other.sqlite")).toBe(false);
    expect(reader().isReadable("local-json", ENDPOINT)).toBe(false);
  });
});

describe("home tools", () => {
  const graph = (resolved: Awaited<ReturnType<HomeGraph["resolveReference"]>>): HomeGraph => ({
    findEntities: vi.fn(async () => ({ status: "not_found" as const })),
    inspectNeighborhood: vi.fn(async () => ({ status: "not_found" as const, notFound: [] })),
    resolveReference: vi.fn(async () => resolved),
    close: async () => {},
  });

  async function call(tools: ReturnType<typeof createHomeTools>, name: string, params: object) {
    const tool = tools.find((candidate) => candidate.name === name)!;
    const result = await tool.execute("call", params as never, undefined, undefined, undefined as never);
    return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
  }

  it("reads observations without exposing endpoints or credentials", async () => {
    const tools = createHomeTools({
      graph: graph({ status: "ok", reference: reference() }),
      reader: reader(),
      budget: { onUnproductive: vi.fn() },
      now: () => NOW,
    });
    const result = await call(tools, "read_external_data", { referenceId: "ref/temp" });
    expect(result).toMatchObject({ status: "ok", checkedAt: "2026-10-19T10:05:00.000Z" });
    expect(JSON.stringify(result)).not.toMatch(/local:|sqlite|endpoint|adapter/);
  });

  it("validates time ranges before touching any source", async () => {
    const homeGraph = graph({ status: "ok", reference: reference() });
    const tools = createHomeTools({ graph: homeGraph, reader: reader(), budget: { onUnproductive: vi.fn() } });
    expect(await call(tools, "read_external_data", { referenceId: "ref/temp", start: "2026-10-19T09:00:00Z" }))
      .toMatchObject({ status: "invalid_arguments" });
    expect(await call(tools, "read_external_data", { referenceId: "ref/temp", start: "2026-10-19T09:00", end: "2026-10-19T10:00" }))
      .toMatchObject({ status: "invalid_arguments" });
    expect(await call(tools, "read_external_data", { referenceId: "ref/temp", start: "2026-10-01T00:00:00Z", end: "2026-10-19T00:00:00Z" }))
      .toMatchObject({ status: "invalid_arguments" });
    expect(homeGraph.resolveReference).not.toHaveBeenCalled();
  });

  it("reports unknown references and a missing graph as structured outcomes", async () => {
    const tools = createHomeTools({ graph: graph({ status: "not_found" }), reader: reader(), budget: { onUnproductive: vi.fn() } });
    expect(await call(tools, "read_external_data", { referenceId: "nope" })).toMatchObject({ status: "not_found", referenceId: "nope" });
    const offline = createHomeTools({ budget: { onUnproductive: vi.fn() } });
    expect(await call(offline, "find_entities", { query: "bedroom" })).toEqual({ status: "unavailable" });
    expect(await call(offline, "read_external_data", { referenceId: "x" })).toMatchObject({ status: "unavailable" });
  });

  it("turns unexpected defects into explicit tool failures, not empty results", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: HomeGraph = { ...graph({ status: "not_found" }), findEntities: vi.fn(async () => { throw new TypeError("bug"); }) };
    const tools = createHomeTools({ graph: broken, budget: { onUnproductive: vi.fn() } });
    await expect(call(tools, "find_entities", { query: "bedroom" })).rejects.toThrow(/failed unexpectedly/);
  });

  it("reports a slow graph call as a timeout", async () => {
    vi.useFakeTimers();
    try {
      const slow: HomeGraph = {
        ...graph({ status: "not_found" }),
        findEntities: vi.fn((_input, signal) =>
          new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)))),
      };
      const tools = createHomeTools({ graph: slow, budget: { onUnproductive: vi.fn() } });
      const pending = call(tools, "find_entities", { query: "bedroom" });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await pending).toEqual({ status: "unavailable", reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});
