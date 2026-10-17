import { describe, expect, it } from "vitest";
import {
  clusterItems,
  Consolidator,
  LlmInducer,
  Memory,
  MemoryService,
  MockEmbedder,
  PassThroughGate,
  type ChatClient,
  type ChatCompletionRequest,
  type ConsolidatorOptions,
  type MemoryItem,
  type NewMemoryItem,
} from "./index.js";
import { ScriptedExtractor, ScriptedInducer, ScriptedReconciler } from "./testing.js";

const T0 = "2026-03-02T09:00:00.000Z";

async function setup() {
  let now = new Date(T0);
  const memory = await Memory.open({ path: ":memory:", embedder: new MockEmbedder(), clock: () => now });
  memory.store.recordConsent("memory", true, "test");
  const add = async (item: Partial<NewMemoryItem> & { text: string }) => {
    const full: NewMemoryItem = { layer: "L2", subject: "user", ...item };
    const [embedding] = await memory.embedder.embed([`${full.subject}: ${full.text}`]);
    return memory.store.addItem(full, embedding!);
  };
  return {
    memory,
    add,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

async function walkingFacts(add: (item: { text: string; subject?: string }) => Promise<MemoryItem>) {
  return [
    await add({ subject: "Bello", text: "Bello is the user's dog." }),
    await add({ subject: "Bello", text: "The user walks Bello in the park on Monday morning." }),
    await add({ subject: "Bello", text: "The user walks Bello in the park on Wednesday morning." }),
    await add({ subject: "Bello", text: "The user walks Bello in the park on Friday morning." }),
    await add({ text: "The user likes tea with honey." }),
  ];
}

function consolidator(memory: Memory, inducer: ScriptedInducer, options: Partial<ConsolidatorOptions> = {}) {
  return new Consolidator({ memory, inducer, minNewItems: 3, minClusterSize: 3, ...options });
}

describe("clusterItems", () => {
  it("links facts about the same entity but not every fact about the user", async () => {
    const { memory, add } = await setup();
    const facts = await walkingFacts(add);
    const embeddings = await memory.embedder.embed(facts.map((item) => item.text));
    const clusters = clusterItems(facts, embeddings, 0.99);
    expect(clusters.map((cluster) => cluster.length).sort()).toEqual([1, 4]);
  });
});

describe("System 2 consolidation", () => {
  it("induces an inferred routine from a cluster with evidence links", async () => {
    const { memory, add } = await setup();
    const facts = await walkingFacts(add);
    const inducer = new ScriptedInducer(() => [
      {
        layer: "L6",
        subject: "Bello",
        text: "The user walks Bello in the park most weekday mornings.",
        evidence: facts.slice(1, 4).map((item) => item.id),
      },
    ]);
    const report = await consolidator(memory, inducer).run();

    expect(report).toMatchObject({ newItems: 5, clusters: 1, added: 1, replaced: 0 });
    expect(inducer.calls[0]!.cluster.map((item) => item.id).sort((a, b) => a - b)).toEqual(facts.slice(0, 4).map((item) => item.id));
    const [routine] = memory.store.listItems({ layers: ["L6"] });
    expect(routine).toMatchObject({ provenance: "inferred", subject: "Bello" });
    expect(memory.store.evidenceItemIds(routine!.id).sort((a, b) => a - b)).toEqual(facts.slice(1, 4).map((item) => item.id));
  });

  it("by default induces from a cluster of two facts", async () => {
    const { memory, add } = await setup();
    const walks = [
      await add({ subject: "Bello", text: "The user walks Bello in the park on Monday morning." }),
      await add({ subject: "Bello", text: "The user walks Bello in the park on Friday morning." }),
    ];
    await add({ text: "The user likes tea with honey." });
    const inducer = new ScriptedInducer(() => []);
    await new Consolidator({ memory, inducer, minNewItems: 3 }).run();
    expect(inducer.calls.map((call) => call.cluster.map((item) => item.id).sort((a, b) => a - b))).toEqual([walks.map((item) => item.id)]);
  });

  it("commits induced items and the watermark together", async () => {
    const { memory, add } = await setup();
    const facts = await walkingFacts(add);
    const inducer = new ScriptedInducer(() => [
      { layer: "L6", subject: "Bello", text: "Walks Bello on weekday mornings.", evidence: facts.slice(1, 4).map((item) => item.id) },
    ]);
    await expect(
      consolidator(memory, inducer).run(undefined, () => {
        throw new Error("crash before the job is marked done");
      }),
    ).rejects.toThrow("crash");
    expect(memory.store.listItems({ layers: ["L6"] })).toHaveLength(0);
    expect(consolidator(memory, inducer).lastRun()).toBeUndefined();
  });

  it("waits for enough new facts and does not reprocess consolidated ones", async () => {
    const { memory, add } = await setup();
    await add({ text: "The user likes tea." });
    const inducer = new ScriptedInducer(() => []);
    const system2 = consolidator(memory, inducer);
    expect(await system2.run()).toMatchObject({ newItems: 1, clusters: 0 });
    expect(system2.lastRun()).toBeUndefined();

    await walkingFacts(add);
    await system2.run();
    expect(inducer.calls).toHaveLength(1);
    expect(system2.pendingItems()).toBe(0);
    await system2.run();
    expect(inducer.calls).toHaveLength(1);
    expect(system2.lastRun()).toBe(T0);
  });

  it("drops induced items without two supporting facts from the cluster", async () => {
    const { memory, add } = await setup();
    const facts = await walkingFacts(add);
    const inducer = new ScriptedInducer(() => [
      { layer: "L5", subject: "Bello", text: "Single fact", evidence: [facts[0]!.id] },
      { layer: "L7", subject: "user", text: "Outside the cluster", evidence: [facts[0]!.id, facts[4]!.id] },
    ]);
    expect(await consolidator(memory, inducer).run()).toMatchObject({ added: 0 });
    expect(memory.store.listItems({ layers: ["L5", "L6", "L7"] })).toEqual([]);
  });

  it("replaces an outdated induced item and passes existing ones to the inducer", async () => {
    const { memory, add } = await setup();
    const facts = await walkingFacts(add);
    const evidence = facts.slice(1, 4).map((item) => item.id);
    const first = new ScriptedInducer(() => [{ layer: "L6", subject: "Bello", text: "Walks Bello daily.", evidence }]);
    await consolidator(memory, first).run();
    const [old] = memory.store.listItems({ layers: ["L6"] });

    await add({ subject: "Bello", text: "The user no longer walks Bello on Friday." });
    await add({ subject: "Bello", text: "Bello sleeps late on Fridays." });
    await add({ subject: "Bello", text: "Bello has a new red collar." });
    const second = new ScriptedInducer(() => [
      { layer: "L6", subject: "Bello", text: "Walks Bello on Monday and Wednesday.", evidence, replaces: old!.id },
    ]);
    expect(await consolidator(memory, second).run()).toMatchObject({ replaced: 1, added: 0 });
    expect(second.calls[0]!.existing.map((item) => item.id)).toEqual([old!.id]);
    expect(memory.store.getItem(old!.id)?.status).toBe("superseded");
    expect(memory.store.listItems({ layers: ["L6"], statuses: ["active"] })[0]?.text).toBe(
      "Walks Bello on Monday and Wednesday.",
    );
  });

  it("never uses health facts for induction", async () => {
    const { memory, add } = await setup();
    for (const day of ["Monday", "Tuesday", "Wednesday"]) {
      await add({ subject: "insulin", text: `The user injects insulin on ${day}.`, sensitivity: "health" });
    }
    const inducer = new ScriptedInducer(() => []);
    expect(await consolidator(memory, inducer).run()).toMatchObject({ newItems: 0 });
    expect(inducer.calls).toEqual([]);
  });

  it("lowers confidence when evidence is deleted and removes items left without support", async () => {
    const { memory, add } = await setup();
    const facts = await walkingFacts(add);
    const evidence = facts.slice(1, 4).map((item) => item.id);
    await consolidator(memory, new ScriptedInducer(() => [{ layer: "L6", subject: "Bello", text: "Walks.", evidence }])).run();
    const [routine] = memory.store.listItems({ layers: ["L6"] });

    memory.deleteItem(evidence[0]!);
    expect(memory.store.getItem(routine!.id)?.confidence).toBeCloseTo(2 / 3);
    memory.deleteItem(evidence[1]!);
    expect(memory.store.getItem(routine!.id)).toBeUndefined();
    const [embedding] = await memory.embedder.embed(["Bello: Walks."]);
    expect(memory.index.search({ embedding: embedding!, limit: 10 }).map((hit) => hit.itemId)).not.toContain(routine!.id);
  });

  it("runs as a queued job when the service is idle and due", async () => {
    const { memory, add, advance } = await setup();
    await walkingFacts(add);
    const inducer = new ScriptedInducer((cluster) => [
      { layer: "L6", subject: "Bello", text: "Walks Bello in the mornings.", evidence: cluster.map((item) => item.id) },
    ]);
    const service = new MemoryService({
      memory,
      gate: new PassThroughGate(),
      extractor: new ScriptedExtractor(() => []),
      reconciler: new ScriptedReconciler(() => ({ action: "ADD" })),
      consolidator: consolidator(memory, inducer),
      consolidationIntervalMs: 3_600_000,
    });
    expect(service.consolidationDue()).toBe(true);
    service.recordUserTurn({ sessionId: "s", turnId: "t1", text: "Hallo" });
    expect(service.consolidationDue()).toBe(false);
    await service.drain();

    service.maintenance();
    await service.drain();
    expect(memory.store.listItems({ layers: ["L6"] })).toHaveLength(1);
    expect(service.consolidationDue()).toBe(false);
    advance(3_600_000);
    expect(service.consolidationDue()).toBe(true);
    const retrieved = await service.retrieve("When do I walk Bello?");
    expect(retrieved.block).toContain("inferred");
    expect(retrieved.block).toContain("Walks Bello in the mornings.");
    await service.stop();
  });
});

describe("LlmInducer", () => {
  it("sends facts with ids and parses the induced items", async () => {
    const requests: ChatCompletionRequest[] = [];
    const client: ChatClient = {
      id: "fake",
      async complete(request) {
        requests.push(request);
        return {
          content: JSON.stringify({
            items: [
              { layer: "L7", subject: "user", text: "Wants to run a marathon.", evidence: [1, 2], replaces: null },
              { layer: "L9", subject: "user", text: "Invalid layer", evidence: [1, 2], replaces: null },
            ],
          }),
        };
      },
    };
    const { memory, add } = await setup();
    const facts = [await add({ text: "The user runs 10 km." }), await add({ text: "The user signed up for a marathon." })];
    const items = await new LlmInducer(client).induce(facts, []);
    expect(items).toEqual([{ layer: "L7", subject: "user", text: "Wants to run a marathon.", evidence: [1, 2] }]);
    expect(requests[0]!.messages[1]!.content).toContain(`id=${facts[0]!.id}`);
    memory.close();
  });
});
