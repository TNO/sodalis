import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  InMemoryCredentialStore,
  type FauxResponseStep,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanionModel } from "./companionModel.js";
import { createCompanionSession } from "./companionSession.js";
import type { ExternalDataReader } from "./externalData.js";
import type { HomeGraph } from "./homeGraph.js";
import { createHomeTools } from "./tools.js";
import { CompanionWorkflows, type WorkflowEvent, type WorkflowLimits } from "./workflow.js";

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
  readonly sessions: { dispose: ReturnType<typeof vi.fn> }[];
  start(input?: { question?: string; workflowId?: string; sessionId?: string; signal?: AbortSignal }): ReturnType<CompanionWorkflows["start"]>;
}

const open: CompanionWorkflows[] = [];
afterEach(() => {
  open.length = 0;
});

async function harness(options: { graph?: HomeGraph; limits?: Partial<WorkflowLimits>; responses: FauxResponseStep[] }): Promise<Harness> {
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
  const sessions: Harness["sessions"] = [];
  const graph = options.graph ?? fakeGraph();
  const workflows = new CompanionWorkflows({
    ...(options.limits ? { limits: options.limits } : {}),
    async createSession({ history, budget }) {
      const session = await createCompanionSession({
        model,
        history,
        tools: createHomeTools({ graph, reader, budget }),
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
    expect(h.workflows.activeCount).toBe(0);
  });

  it("reports model errors and empty completions as explicit failures, with details only in developer logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = await harness({ responses: [fauxAssistantMessage([], { stopReason: "error", errorMessage: "Unsupported parameter: 'reasoning_effort'" })] });
    const failed = await started(failing.start());
    expect(failed).toMatchObject({ type: "failed", code: "model_error" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Unsupported parameter: 'reasoning_effort'"));
    expect(failed.type === "failed" && failed.residentMessage).not.toMatch(/reasoning|parameter/i);
    const empty = await harness({ responses: [fauxAssistantMessage("   ")] });
    const terminal = await started(empty.start());
    expect(terminal).toMatchObject({ type: "failed", code: "empty" });
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
