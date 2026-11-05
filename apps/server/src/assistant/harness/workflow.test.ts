import {
  fauxAssistantMessage,
  fauxProvider,
  fauxThinking,
  fauxText,
  fauxToolCall,
  InMemoryCredentialStore,
  type FauxResponseStep,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { FileCompanionAuditWriter } from "./audit.js";
import type { CompanionModel } from "./companionModel.js";
import { createCompanionSession } from "./companionSession.js";
import { SqliteReadingsReader, type ExternalDataReader } from "./externalData.js";
import type { HomeGraph } from "./homeGraph.js";
import { createHomeTools } from "./tools.js";
import { CompanionWorkflows, type WorkflowEvent, type WorkflowLimits } from "./workflow.js";
import type { CompanionAuditEvent, CompanionAuditSink } from "./audit.js";
import { loadSimulatorSnapshot } from "./simulatorSnapshot.test-support.js";

const ROOM = "home/bedroom";
const SENSOR = "home/temp-sensor";
const REFERENCE = "external/bedroom-temperature";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeGraph(overrides: Partial<HomeGraph> = {}): HomeGraph {
  return {
    findEntities: vi.fn(async () => ({
      status: "ok" as const,
      candidates: [{ id: ROOM, name: "Slaapkamer 1", kinds: ["Bedroom", "Space"] }],
      truncated: false,
    })),
    inspectNeighborhood: vi.fn(async () => ({
      status: "ok" as const,
      entities: [
        { id: ROOM, name: "Slaapkamer 1", kinds: ["Bedroom"] },
        { id: SENSOR, name: "Temperature sensor", kinds: ["Sensor"], configuredState: "online" },
      ],
      relationships: [{ from: SENSOR, type: "INSTALLED_IN", to: ROOM }],
      externalData: [{ id: REFERENCE, name: "Temperature history", ownerIds: [SENSOR], readable: true }],
      notFound: [],
      truncated: false,
    })),
    resolveReference: vi.fn(async (id: string) => ({
      status: "ok" as const,
      reference: {
        id,
        name: "Temperature history",
        adapter: "sqlite",
        endpoint: "local://simulation/timeseries.sqlite",
        resource: "series",
        capabilities: [],
      },
    })),
    close: async () => {},
    ...overrides,
  };
}

const reader: ExternalDataReader = {
  isReadable: () => true,
  read: async (reference) => ({
    status: "ok",
    referenceId: reference.id,
    name: reference.name,
    unit: "degree Celsius",
    latest: { value: 19.2, observedAt: "2026-11-04T11:00:00+01:00" },
    freshness: "current",
    ageMinutes: 2,
  }),
};

interface Harness {
  readonly workflows: CompanionWorkflows;
  readonly faux: ReturnType<typeof fauxProvider>;
  readonly events: WorkflowEvent[];
  readonly auditEvents: CompanionAuditEvent[];
  readonly sessions: { dispose: ReturnType<typeof vi.fn> }[];
  start(input?: { question?: string; workflowId?: string; sessionId?: string; signal?: AbortSignal }): ReturnType<CompanionWorkflows["start"]>;
}

const open: CompanionWorkflows[] = [];
afterEach(() => {
  open.length = 0;
});

async function harness(options: {
  graph?: HomeGraph;
  limits?: Partial<WorkflowLimits>;
  responses: FauxResponseStep[];
  audit?: CompanionAuditSink;
  reader?: ExternalDataReader;
  now?: () => number;
}): Promise<Harness> {
  const faux = fauxProvider();
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  faux.setResponses(options.responses);
  const model: CompanionModel = { modelRuntime, model: faux.getModel(), thinkingLevel: "off" };
  const events: WorkflowEvent[] = [];
  const auditEvents: CompanionAuditEvent[] = [];
  const audit = options.audit ?? { write: (event: CompanionAuditEvent) => { auditEvents.push(event); } };
  const sessions: Harness["sessions"] = [];
  const graph = options.graph ?? fakeGraph();
  const workflows = new CompanionWorkflows({
    ...(options.limits ? { limits: options.limits } : {}),
    audit,
    async createSession({ history, budget }) {
      const session = await createCompanionSession({
        model,
        history,
        tools: createHomeTools({
          graph, reader: options.reader ?? reader, budget,
          ...(options.now ? { now: options.now } : {}),
        }),
      });
      const dispose = vi.fn(session.dispose.bind(session));
      session.dispose = dispose;
      sessions.push({ dispose });
      return session;
    },
  });
  open.push(workflows);
  return {
    workflows,
    faux,
    events,
    auditEvents,
    sessions,
    start: (input = {}) =>
      workflows.start(
        {
          sessionId: input.sessionId ?? "session-1",
          workflowId: input.workflowId ?? "workflow-1",
          inputId: "input-1",
          messages: [
            { role: "user", content: "Hoe warm was het gisteren?" },
            { role: "assistant", content: "Gisteren was het 18 graden." },
            { role: "user", content: input.question ?? "What is the bedroom temperature?" },
          ],
        },
        { onEvent: (event) => events.push(event), ...(input.signal ? { signal: input.signal } : {}) },
      ),
  };
}

function toolResultTexts(context: { messages: readonly unknown[] }): string[] {
  return context.messages
    .filter((message): message is { role: "toolResult"; content: { text: string }[] } =>
      (message as { role?: string }).role === "toolResult")
    .map((message) => message.content.map((part) => part.text).join(""));
}

function userTexts(context: { messages: readonly unknown[] }): string[] {
  return context.messages
    .filter((message): message is { role: "user"; content: unknown } => (message as { role?: string }).role === "user")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : (message.content as { text?: string }[]).map((part) => part.text ?? "").join(""));
}

// These are the existing scripted workflow's synthetic reference and reading,
// not a captured simulator snapshot or evidence of a real bedroom mapping.
const journeyDirectory = resolve(`.sensor-journey-${randomUUID()}`);
const journeyFile = resolve(journeyDirectory, "readings.sqlite");
const journeyNow = Date.parse("2026-11-04T10:02:00Z");
beforeAll(() => {
  mkdirSync(journeyDirectory);
  const database = new DatabaseSync(journeyFile);
  try {
    database.exec("CREATE TABLE readings (series TEXT, timestamp TEXT, property TEXT, value REAL, event_type TEXT)");
    database.prepare("INSERT INTO readings VALUES (?, ?, ?, ?, ?)").run(
      "series", "2026-11-04T11:00:00+01:00", "Temperature", 19.2, "measurement",
    );
  } finally {
    database.close();
  }
});
afterAll(() => rmSync(journeyDirectory, { recursive: true, force: true }));

// Explicit local opt-in only: CI must never open household snapshots.
const snapshotDirectory = process.env.CI ? undefined : process.env.SODALIS_SENSOR_SNAPSHOT_DIR;
describe.skipIf(!snapshotDirectory)("local simulator snapshot through the public workflow", () => {
  it.each([
    ["recent-at-fixed-check", "2026-10-19T22:01:00Z", "current", 2],
    ["historical-at-fixed-check", "2026-11-05T12:00:00Z", "stale", 23881],
  ] as const)("grounds %s evidence and correlates the entire run", async (label, checkedAt, freshness, ageMinutes) => {
    const snapshot = await loadSimulatorSnapshot(snapshotDirectory!);
    const now = () => Date.parse(checkedAt);
    const source = new SqliteReadingsReader({
      endpoint: snapshot.reference.endpoint!, file: snapshot.file, now,
    });
    const read = vi.spyOn(source, "read");
    const answer = `${snapshot.reference.name} reports ${snapshot.observation.value} ${snapshot.unit}, observed at ${snapshot.observation.observedAt}, for the sensor installed in ${snapshot.room.name}. At ${checkedAt} this snapshot observation is ${ageMinutes} minutes old (${freshness}). This is a local simulator snapshot, not a live/current room reading.`;
    const h = await harness({
      graph: snapshot.graph, reader: source, now,
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: snapshot.room.name, kind: "room" })),
        (context) => {
          expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
            status: "ok", candidates: [{ id: snapshot.room.id }],
          });
          return fauxAssistantMessage(fauxToolCall("inspect_neighborhood", { entityIds: [snapshot.room.id] }));
        },
        (context) => {
          expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
            relationships: [{ from: snapshot.sensor.id, type: "INSTALLED_IN", to: snapshot.room.id }],
            externalData: [{ id: snapshot.reference.id, ownerIds: [snapshot.sensor.id], readable: true }],
          });
          return fauxAssistantMessage(fauxToolCall("read_external_data", { referenceId: snapshot.reference.id }));
        },
        (context) => {
          const text = toolResultTexts(context).at(-1)!;
          expect(text).not.toMatch(/local:|sqlite|endpoint|adapter/);
          expect(JSON.parse(text)).toMatchObject({
            status: "ok", referenceId: snapshot.reference.id, name: snapshot.reference.name,
            unit: snapshot.unit, latest: snapshot.observation, freshness, ageMinutes,
            checkedAt: new Date(checkedAt).toISOString(),
          });
          return fauxAssistantMessage(fauxText(answer));
        },
      ],
    });
    const workflowId = `simulator-${label}`;
    expect(await started(h.start({ workflowId, question: `What does the temperature sensor installed in ${snapshot.room.name} report?` })))
      .toMatchObject({ type: "answer", workflowId, text: answer });
    expect(read).toHaveBeenCalledOnce();
    assertJourneyAudit(h.auditEvents, workflowId, [
      ["find_entities", "ok"], ["inspect_neighborhood", "ok"], ["read_external_data", "ok"],
    ]);
    expect(auditedRead(h.auditEvents)).toMatchObject({
      latest: snapshot.observation, freshness, ageMinutes, checkedAt: new Date(checkedAt).toISOString(),
    });
  });
});

describe("synthetic sensor journey through the public workflow", () => {
  it("discovers a reference, reads SQLite, and delivers source, timestamp and freshness with a correlated audit", async () => {
    const answer = "The synthetic bedroom fixture reports 19.2 degrees Celsius from Temperature history, observed at 2026-11-04T11:00:00+01:00. It is current at the fixture check time, two minutes later; this is not a live reading.";
    const graph = fakeGraph({
      resolveReference: vi.fn(async () => ({
        status: "ok" as const,
        reference: {
          id: REFERENCE, name: "Temperature history", adapter: "sqlite",
          endpoint: "local://simulation/timeseries.sqlite", resource: "series",
          capabilities: [{ id: "sensor/measurement/Temperature", unit: "degree Celsius" }],
        },
      })),
    });
    const source = new SqliteReadingsReader({
      endpoint: "local://simulation/timeseries.sqlite", file: journeyFile, now: () => journeyNow,
    });
    const read = vi.spyOn(source, "read");
    const h = await harness({
      graph, reader: source, now: () => journeyNow,
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
        (context) => {
          const resultText = toolResultTexts(context).at(-1)!;
          expect(resultText).not.toMatch(/local:|sqlite|endpoint|adapter/);
          expect(JSON.parse(resultText)).toMatchObject({
            status: "ok", candidates: [{ id: ROOM }],
          });
          return fauxAssistantMessage(fauxToolCall("inspect_neighborhood", { entityIds: [ROOM] }));
        },
        (context) => {
          expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
            relationships: [{ from: SENSOR, type: "INSTALLED_IN", to: ROOM }],
            externalData: [{ id: REFERENCE, ownerIds: [SENSOR], readable: true }],
          });
          return fauxAssistantMessage(fauxToolCall("read_external_data", { referenceId: REFERENCE }));
        },
        (context) => {
          const resultText = toolResultTexts(context).at(-1)!;
          expect(resultText).not.toMatch(/local:|sqlite|endpoint|adapter/);
          expect(JSON.parse(resultText)).toMatchObject({
            status: "ok", referenceId: REFERENCE, name: "Temperature history", unit: "degree Celsius",
            latest: { value: 19.2, observedAt: "2026-11-04T11:00:00+01:00" },
            freshness: "current", ageMinutes: 2, checkedAt: "2026-11-04T10:02:00.000Z",
          });
          return fauxAssistantMessage(fauxText(answer));
        },
      ],
    });
    const terminal = await started(h.start({ workflowId: "sensor-current" }));
    expect(terminal).toMatchObject({ type: "answer", workflowId: "sensor-current", text: answer });
    expect(read).toHaveBeenCalledOnce();
    expect(graph.resolveReference).toHaveBeenCalledWith(REFERENCE, expect.any(AbortSignal));
    assertJourneyAudit(h.auditEvents, "sensor-current", [
      ["find_entities", "ok"], ["inspect_neighborhood", "ok"], ["read_external_data", "ok"],
    ]);
    expect(auditedRead(h.auditEvents)).toMatchObject({
      status: "ok", referenceId: REFERENCE, freshness: "current", ageMinutes: 2,
      latest: { value: 19.2, observedAt: "2026-11-04T11:00:00+01:00" },
    });
  });

  it("reports a historical reading as stale, not a current room temperature", async () => {
    await assertReadJourney({
      workflowId: "sensor-stale",
      now: Date.parse("2026-11-04T11:05:00Z"),
      expected: {
        status: "ok", referenceId: REFERENCE, name: "Temperature history",
        latest: { value: 19.2, observedAt: "2026-11-04T11:00:00+01:00" },
        freshness: "stale", ageMinutes: 65, checkedAt: "2026-11-04T11:05:00.000Z",
      },
      answer: "Temperature history last reported 19.2 degrees Celsius at 2026-11-04T11:00:00+01:00. At the fixture check time this is 65 minutes old and stale; I cannot establish the current temperature.",
    });
  });

  it("reports an unreachable configured source without substituting a reading", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await assertReadJourney({
      workflowId: "sensor-unreachable", file: resolve(journeyDirectory, "missing.sqlite"),
      expected: { status: "unavailable", referenceId: REFERENCE, reason: "source_unreachable" },
      answer: "The fixture's Temperature history source is unavailable. I have no observation or observation timestamp and cannot establish the temperature or its freshness.",
    });
  });

  it("reports an empty series without treating absent data as a zero reading", async () => {
    await assertReadJourney({
      workflowId: "sensor-empty", resource: "unknown",
      expected: { status: "no_data", referenceId: REFERENCE, name: "Temperature history" },
      answer: "The fixture's Temperature history series contains no observations. There is no reading, observation timestamp or freshness to report.",
    });
  });

  it("clarifies a wrong-entity lookup rather than reading another room's sensor", async () => {
    const graph = fakeGraph();
    const read = vi.fn(reader.read);
    const answer = "The fixture lookup returned Slaapkamer 1, a bedroom, not the living room you asked about. Which room did you mean? I have not read a living-room sensor.";
    const h = await harness({
      graph, reader: { ...reader, read },
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "living room" })),
        (context) => {
          expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
            status: "ok", candidates: [{ id: ROOM, name: "Slaapkamer 1", kinds: ["Bedroom", "Space"] }],
          });
          return fauxAssistantMessage(fauxText(answer));
        },
      ],
    });
    expect(await started(h.start({ workflowId: "sensor-wrong-entity", question: "What is the living room temperature?" })))
      .toMatchObject({ type: "answer", text: answer });
    expect(graph.inspectNeighborhood).not.toHaveBeenCalled();
    expect(graph.resolveReference).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    assertJourneyAudit(h.auditEvents, "sensor-wrong-entity", [["find_entities", "ok"]]);
  });

  it("reports conflicting location and reference evidence without inventing a bedroom reading", async () => {
    const graph = fakeGraph({
      inspectNeighborhood: vi.fn(async () => ({
        status: "ok" as const,
        entities: [
          { id: ROOM, name: "Slaapkamer 1", kinds: ["Bedroom"] },
          { id: "home/bathroom", name: "Badkamer", kinds: ["Space"] },
          { id: SENSOR, name: "Temperature sensor", kinds: ["Sensor"] },
        ],
        relationships: [{ from: SENSOR, type: "INSTALLED_IN", to: "home/bathroom" }],
        externalData: [{
          id: REFERENCE, name: "Bedroom temperature database series", ownerIds: [SENSOR], readable: false,
        }],
        notFound: [], truncated: false,
      })),
    });
    const read = vi.fn(reader.read);
    const answer = "The fixture places this sensor in Badkamer, but its reference is named Bedroom temperature database series and is not readable. That conflicting evidence does not establish a bedroom reading or a current observation.";
    const h = await harness({
      graph, reader: { ...reader, read },
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
        (context) => {
          expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
            status: "ok", candidates: [{ id: ROOM }],
          });
          return fauxAssistantMessage(fauxToolCall("inspect_neighborhood", { entityIds: [ROOM] }));
        },
        (context) => {
          expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
            relationships: [{ from: SENSOR, type: "INSTALLED_IN", to: "home/bathroom" }],
            externalData: [{ name: "Bedroom temperature database series", readable: false }],
          });
          return fauxAssistantMessage(fauxText(answer));
        },
      ],
    });
    expect(await started(h.start({ workflowId: "sensor-conflict" })))
      .toMatchObject({ type: "answer", text: answer });
    expect(graph.resolveReference).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    assertJourneyAudit(h.auditEvents, "sensor-conflict", [["find_entities", "ok"], ["inspect_neighborhood", "ok"]]);
  });
});

async function assertReadJourney(input: {
  workflowId: string;
  now?: number;
  resource?: string;
  file?: string;
  adapter?: string;
  expected: Record<string, unknown> & { status: string };
  answer: string;
}) {
  const graph = fakeGraph({
    resolveReference: vi.fn(async () => ({
      status: "ok" as const,
      reference: {
        id: REFERENCE, name: "Temperature history", adapter: input.adapter ?? "sqlite",
        endpoint: "local://simulation/timeseries.sqlite", resource: input.resource ?? "series",
        capabilities: [{ id: "sensor/measurement/Temperature", unit: "degree Celsius" }],
      },
    })),
  });
  const now = () => input.now ?? journeyNow;
  const source = new SqliteReadingsReader({
    endpoint: "local://simulation/timeseries.sqlite", file: input.file ?? journeyFile, now,
  });
  const read = vi.spyOn(source, "read");
  const h = await harness({
    graph, reader: source, now,
    responses: [
      fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
      (context) => {
        expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
          status: "ok", candidates: [{ id: ROOM }],
        });
        return fauxAssistantMessage(fauxToolCall("inspect_neighborhood", { entityIds: [ROOM] }));
      },
      (context) => {
        expect(JSON.parse(toolResultTexts(context).at(-1)!)).toMatchObject({
          status: "ok", externalData: [{ id: REFERENCE, ownerIds: [SENSOR] }],
        });
        return fauxAssistantMessage(fauxToolCall("read_external_data", { referenceId: REFERENCE }));
      },
      (context) => {
        const resultText = toolResultTexts(context).at(-1)!;
        expect(resultText).not.toMatch(/local:|sqlite|endpoint|adapter/);
        const result = JSON.parse(resultText) as Record<string, unknown>;
        expect(result).toMatchObject(input.expected);
        if (input.expected.status !== "ok") expect(result).not.toHaveProperty("latest");
        return fauxAssistantMessage(fauxText(input.answer));
      },
    ],
  });
  const terminal = await started(h.start({ workflowId: input.workflowId }));
  expect(terminal).toMatchObject({ type: "answer", text: input.answer, workflowId: input.workflowId });
  expect(read).toHaveBeenCalledOnce();
  assertJourneyAudit(h.auditEvents, input.workflowId, [
    ["find_entities", "ok"], ["inspect_neighborhood", "ok"], ["read_external_data", input.expected.status],
  ]);
  expect(auditedRead(h.auditEvents)).toMatchObject(input.expected);
}

function auditedRead(events: CompanionAuditEvent[]): unknown {
  const event = events.find((event) => event.event === "tool.result" && event.toolName === "read_external_data")!;
  const result = event.result as { content: { text: string }[] };
  return JSON.parse(result.content[0]!.text);
}

function assertJourneyAudit(
  events: CompanionAuditEvent[],
  workflowId: string,
  tools: readonly (readonly [string, string])[],
) {
  expect(events.every((event) => event.workflowId === workflowId && event.sessionId === "session-1")).toBe(true);
  expect(events.filter((event) => event.event === "workflow.started")).toMatchObject([
    { workflowId, correlationId: workflowId },
  ]);
  for (const kind of ["tool.selected", "tool.dispatched", "tool.result"]) {
    expect(events.filter((event) => event.event === kind).map((event) => event.toolName))
      .toEqual(tools.map(([name]) => name));
  }
  for (const [name, outcome] of tools) {
    const lifecycle = events.filter((event) => event.toolName === name);
    const selected = lifecycle.find((event) => event.event === "tool.selected")!;
    expect(selected.toolCallId).toEqual(expect.any(String));
    expect(selected.toolCallId).not.toBe("");
    expect(lifecycle.map((event) => event.event)).toEqual(["tool.selected", "tool.dispatched", "tool.result"]);
    expect(lifecycle.every((event) =>
      event.correlationId === selected.toolCallId && event.toolCallId === selected.toolCallId)).toBe(true);
    expect(lifecycle.at(-1)).toMatchObject({ validationDecision: outcome, isError: false });
  }
  expect(events.filter((event) => event.event === "workflow.terminal")).toMatchObject([
    { workflowId, correlationId: workflowId, outcome: "answer" },
  ]);
}

async function started(result: ReturnType<CompanionWorkflows["start"]>) {
  if (result.status !== "started") throw new Error(`Workflow did not start: ${result.status}`);
  return result.done;
}

describe("companion workflow", () => {
  it("continues from tool results and publishes only the settled final answer", async () => {
    const seen: string[][] = [];
    const h = await harness({
      responses: [
        (context) => {
          expect(userTexts(context)).toEqual([
            "Hoe warm was het gisteren?",
            "What is the bedroom temperature?",
          ]);
          return fauxAssistantMessage([fauxText("Let me look that up."), fauxToolCall("find_entities", { query: "bedroom" })]);
        },
        (context) => {
          seen.push(toolResultTexts(context));
          return fauxAssistantMessage(fauxToolCall("inspect_neighborhood", { entityIds: [ROOM] }));
        },
        (context) => {
          seen.push(toolResultTexts(context));
          return fauxAssistantMessage(fauxToolCall("read_external_data", { referenceId: REFERENCE }));
        },
        (context) => {
          seen.push(toolResultTexts(context));
          return fauxAssistantMessage(fauxText("The bedroom is 19.2 degrees."));
        },
      ],
    });

    const terminal = await started(h.start());

    expect(seen[0]![0]).toContain(ROOM);
    expect(seen[1]![1]).toContain(REFERENCE);
    expect(JSON.parse(seen[2]![2]!)).toMatchObject({ status: "ok", latest: { value: 19.2 }, unit: "degree Celsius" });
    expect(seen[2]![2]).not.toContain("local://");
    expect(terminal).toEqual({ type: "answer", workflowId: "workflow-1", sequence: 1, inputId: "input-1", text: "The bedroom is 19.2 degrees." });
    expect(h.events).toEqual([{ type: "started", workflowId: "workflow-1", sequence: 0 }, terminal]);
    await vi.waitFor(() => expect(h.sessions[0]!.dispose).toHaveBeenCalled());
    expect(h.workflows.activeCount).toBe(0);
  });

  it("sends a correlated, distinct lifecycle from the Pi event stream to the developer audit", async () => {
    const h = await harness({
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
        fauxAssistantMessage(fauxText("The bedroom is ready.")),
      ],
    });

    await started(h.start());

    expect(h.auditEvents.map(({ event }) => event)).toEqual(expect.arrayContaining([
      "workflow.started",
      "user.message",
      "model.run.started",
      "model.turn.started",
      "tool.selected",
      "tool.dispatched",
      "tool.result",
      "assistant.message",
      "model.turn.completed",
      "model.run.settled",
      "workflow.terminal",
    ]));
    expect(h.auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "user.message", text: "Hoe warm was het gisteren?", source: "conversation_history" }),
      expect.objectContaining({ event: "assistant.message", text: "Gisteren was het 18 graden.", source: "conversation_history" }),
    ]));
    const selection = h.auditEvents.find((event) => event.event === "tool.selected")!;
    const dispatch = h.auditEvents.find((event) => event.event === "tool.dispatched")!;
    const result = h.auditEvents.find((event) => event.event === "tool.result")!;
    expect(selection).toMatchObject({ workflowId: "workflow-1", sessionId: "session-1", toolName: "find_entities" });
    expect(dispatch).toMatchObject({ workflowId: "workflow-1", sessionId: "session-1", toolName: "find_entities" });
    expect(result).toMatchObject({ workflowId: "workflow-1", sessionId: "session-1", toolName: "find_entities" });
    expect(selection.correlationId).toBe(dispatch.correlationId);
    expect(dispatch.correlationId).toBe(result.correlationId);
    expect(h.auditEvents.at(-1)).toMatchObject({ event: "workflow.terminal", outcome: "answer" });
  });

  it("writes text-only speech transcripts, redacts credentials, and excludes hidden reasoning and artifacts", async () => {
    const directory = resolve(import.meta.dirname, "../../../../../logs", `audit-test-${randomUUID()}`);
    const writer = new FileCompanionAuditWriter(directory);
    try {
      const transcript = "Transcript: bedroom is warm; Authorization: Bearer resident-secret";
      const h = await harness({
        audit: writer,
        responses: [
          fauxAssistantMessage(fauxToolCall("find_entities", { query: "token=tool-secret client_secret=client-secret dbPassword=db-password" })),
          fauxAssistantMessage([
            fauxThinking("private hidden reasoning must not be captured"),
            fauxText("The bedroom is ready; api_key=answer-secret"),
          ]),
        ],
      });

      await started(h.start({ question: transcript }));
      await writer.write({
        event: "credential.redaction.test",
        workflowId: "workflow-1",
        sessionId: "session-1",
        correlationId: "workflow-1",
        timestamp: new Date().toISOString(),
        text: '{"client_secret":"json-secret","dbPassword":"json-db-password"}',
      });
      await writer.flush();

      const [jsonl, human] = await Promise.all([
        readFile(writer.paths.jsonl, "utf8"),
        readFile(writer.paths.transcript, "utf8"),
      ]);
      const records = jsonl.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records.find((event) => event.event === "user.message" &&
        event.source !== "conversation_history")?.text)
        .toBe("Transcript: bedroom is warm; authorization: [REDACTED]");
      expect(records.find((event) => event.event === "assistant.message" &&
        typeof event.text === "string" && event.text.startsWith("The bedroom"))?.text)
        .toBe("The bedroom is ready; api_key=[REDACTED]");
      expect(records.find((event) => event.event === "credential.redaction.test")?.text)
        .toBe('{"client_secret":"[REDACTED]","dbPassword":"[REDACTED]"}');
      expect(jsonl + human).not.toContain("resident-secret");
      expect(jsonl + human).not.toContain("tool-secret");
      expect(jsonl + human).not.toContain("client-secret");
      expect(jsonl + human).not.toContain("db-password");
      expect(jsonl + human).not.toContain("json-secret");
      expect(jsonl + human).not.toContain("json-db-password");
      expect(jsonl + human).not.toContain("answer-secret");
      expect(jsonl + human).not.toContain("private hidden reasoning");
      expect(records.some((event) => "audio" in event || "recording" in event || "artifact" in event)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports ordinary audit write failures without changing workflow delivery", async () => {
    const directory = resolve(import.meta.dirname, "../../../../../logs", `audit-failure-${randomUUID()}`);
    await writeFile(directory, "not a directory");
    const audit = new FileCompanionAuditWriter(directory);
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const h = await harness({
        audit,
        responses: [fauxAssistantMessage(fauxText("The answer is ready."))],
      });

      expect(await started(h.start())).toMatchObject({ type: "answer", text: "The answer is ready." });
      await audit.flush();
      expect(report).toHaveBeenCalledWith(
        "Developer audit write failed:",
        expect.objectContaining({ code: "EEXIST" }),
      );
    } finally {
      report.mockRestore();
      await rm(directory, { force: true });
    }
  });

  it("answers ordinary conversation without tools", async () => {
    const h = await harness({ responses: [fauxAssistantMessage(fauxText("Goedemorgen!"))] });
    expect(await started(h.start({ question: "Goedemorgen" }))).toMatchObject({ type: "answer", text: "Goedemorgen!" });
  });

  it("processes steering accepted before settlement before publishing an answer", async () => {
    const lookup = deferred();
    const lookupStarted = deferred();
    const graph = fakeGraph({
      findEntities: vi.fn(async () => {
        lookupStarted.resolve();
        await lookup.promise;
        return { status: "not_found" as const };
      }),
    });
    const h = await harness({
      graph,
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
        (context) => {
          expect(userTexts(context).at(-1)).toBe("And the kitchen?");
          return fauxAssistantMessage(fauxText("I could not find the bedroom; the kitchen is 21 degrees."));
        },
      ],
    });
    const result = h.start();
    await lookupStarted.promise;

    expect(h.workflows.steer("workflow-1", "input-2", "And the kitchen?")).toBe("accepted");
    expect(h.workflows.steer("workflow-1", "input-2", "And the kitchen?")).toBe("duplicate");
    lookup.resolve();

    expect(await started(result)).toMatchObject({ type: "answer", inputId: "input-2" });
    expect(h.events.filter((event) => event.type !== "started")).toHaveLength(1);
  });

  it("does not publish an answer that precedes steering accepted at the last moment", async () => {
    let workflows!: CompanionWorkflows;
    const h = await harness({
      responses: [
        () => {
          // The resident speaks while the final answer is being generated.
          expect(workflows.steer("workflow-1", "input-2", "Actually, the living room.")).toBe("accepted");
          return fauxAssistantMessage(fauxText("The bedroom is 19.2 degrees."));
        },
        fauxAssistantMessage(fauxText("The living room is 21 degrees.")),
      ],
    });
    workflows = h.workflows;
    expect(await started(h.start())).toMatchObject({ type: "answer", inputId: "input-2", text: "The living room is 21 degrees." });
  });

  it("rejects steering after settlement so the desktop starts a new workflow", async () => {
    const h = await harness({ responses: [fauxAssistantMessage(fauxText("Done."))] });
    await started(h.start());
    expect(h.workflows.steer("workflow-1", "input-2", "One more thing")).toBe("not_running");
    expect(h.workflows.cancel("workflow-1")).toBe("not_running");
  });

  it("cancels without publishing late output", async () => {
    const lookup = deferred();
    const lookupStarted = deferred();
    let aborted = false;
    const graph = fakeGraph({
      findEntities: vi.fn(async (_input, signal) => {
        lookupStarted.resolve();
        signal?.addEventListener("abort", () => {
          aborted = true;
        });
        await lookup.promise;
        return { status: "not_found" as const };
      }),
    });
    const h = await harness({
      graph,
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
        fauxAssistantMessage(fauxText("Late answer")),
      ],
    });
    const result = h.start();
    await lookupStarted.promise;

    expect(h.workflows.cancel("workflow-1")).toBe("cancelled");
    expect(await started(result)).toEqual({ type: "cancelled", workflowId: "workflow-1", sequence: 1 });
    lookup.resolve();
    await vi.waitFor(() => expect(h.sessions[0]!.dispose).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(aborted).toBe(true);
    expect(h.events.map((event) => event.type)).toEqual(["started", "cancelled"]);
    expect(h.auditEvents.at(-1)).toMatchObject({ event: "workflow.terminal", outcome: "cancelled" });
    expect(h.workflows.steer("workflow-1", "input-2", "Hello?")).toBe("not_running");
  });

  it("stops server work silently when the stream disconnects", async () => {
    const lookupStarted = deferred();
    const graph = fakeGraph({
      findEntities: vi.fn(async (_input, signal) => {
        lookupStarted.resolve();
        await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
        return { status: "not_found" as const };
      }),
    });
    const h = await harness({ graph, responses: [fauxAssistantMessage(fauxToolCall("find_entities", { query: "x" }))] });
    const disconnect = new AbortController();
    h.start({ signal: disconnect.signal });
    await lookupStarted.promise;
    disconnect.abort();
    await vi.waitFor(() => expect(h.sessions[0]!.dispose).toHaveBeenCalled());
    expect(h.events.map((event) => event.type)).toEqual(["started"]);
    expect(h.auditEvents.at(-1)).toMatchObject({ event: "workflow.terminal", outcome: "disconnected" });
    expect(h.workflows.activeCount).toBe(0);
  });

  it("reports model errors and empty completions as explicit failures, with details only in developer logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = await harness({ responses: [fauxAssistantMessage([], { stopReason: "error", errorMessage: "Unsupported parameter: 'reasoning_effort'" })] });
    const failed = await started(failing.start());
    expect(failed).toMatchObject({ type: "failed", code: "model_error" });
    expect(failing.auditEvents.at(-1)).toMatchObject({ event: "workflow.terminal", outcome: "failed", terminalCode: "model_error" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Unsupported parameter: 'reasoning_effort'"));
    expect(failed.type === "failed" && failed.residentMessage).not.toMatch(/reasoning|parameter/i);
    const empty = await harness({ responses: [fauxAssistantMessage("   ")] });
    const terminal = await started(empty.start());
    expect(terminal).toMatchObject({ type: "failed", code: "empty" });
    expect(empty.auditEvents.at(-1)).toMatchObject({ event: "workflow.terminal", outcome: "failed", terminalCode: "empty" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("no answer text"));
    expect(terminal.type === "failed" && terminal.residentMessage).not.toMatch(/boom|error/i);
    log.mockRestore();
  });

  it("stops an investigation at the model-turn limit with a host-authored message", async () => {
    const h = await harness({
      limits: { maxModelTurns: 3 },
      responses: Array.from({ length: 6 }, (_, index) =>
        fauxAssistantMessage(fauxToolCall("find_entities", { query: `room ${index}` }))),
    });
    expect(await started(h.start())).toMatchObject({ type: "failed", code: "limit", residentMessage: expect.any(String) });
    expect(h.faux.state.callCount).toBe(3);
  });

  it("reuses equivalent calls and stops repeated unproductive calls", async () => {
    const graph = fakeGraph();
    const repeated: string[] = [];
    const h = await harness({
      graph,
      responses: Array.from({ length: 6 }, () => (context: { messages: readonly unknown[] }) => {
        repeated.push(toolResultTexts(context).at(-1) ?? "");
        return fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" }));
      }),
    });
    expect(await started(h.start())).toMatchObject({ type: "failed", code: "limit" });
    expect(graph.findEntities).toHaveBeenCalledTimes(1);
    expect(JSON.parse(repeated[2]!)).toMatchObject({ repeated: true, result: { status: "ok" } });
  });

  it("times out a workflow whose tool never returns", async () => {
    const graph = fakeGraph({
      findEntities: vi.fn((_input, signal) =>
        new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)))),
    });
    const h = await harness({
      graph,
      limits: { timeoutMs: 50 },
      responses: [fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" }))],
    });
    expect(await started(h.start())).toMatchObject({ type: "failed", code: "timeout" });
  });

  it("keeps one foreground workflow per conversation", async () => {
    const lookup = deferred();
    const graph = fakeGraph({
      findEntities: vi.fn(async () => {
        await lookup.promise;
        return { status: "not_found" as const };
      }),
    });
    const h = await harness({
      graph,
      responses: [
        fauxAssistantMessage(fauxToolCall("find_entities", { query: "bedroom" })),
        fauxAssistantMessage(fauxText("Nothing found.")),
      ],
    });
    const first = h.start();
    expect(h.start({ workflowId: "workflow-2" })).toEqual({ status: "conflict" });
    expect(h.start({ sessionId: "session-2" })).toEqual({ status: "conflict" });
    lookup.resolve();
    await started(first);
  });
});
