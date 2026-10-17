import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LlmDecisionGate,
  Memory,
  MemoryService,
  MockEmbedder,
  detectLanguage,
  extractionUserPrompt,
  parseExtractedItems,
  PassThroughGate,
  redactCredentials,
  sanitiseDecisions,
  type ChatClient,
  type ChatCompletion,
  type ChatCompletionRequest,
  type MemoryServiceOptions,
  type WriteTrace,
} from "./index.js";
import { fact, ScriptedExtractor, ScriptedGate, ScriptedReconciler } from "./testing.js";

const T0 = "2026-03-02T09:00:00.000Z";

async function service(
  options: Partial<Omit<MemoryServiceOptions, "memory">> & { path?: string; consent?: boolean } = {},
) {
  let now = new Date(T0);
  const memory = await Memory.open({ path: options.path ?? ":memory:", embedder: new MockEmbedder(), clock: () => now });
  const traces: WriteTrace[] = [];
  const memoryService = new MemoryService({
    memory,
    gate: options.gate ?? new PassThroughGate(),
    extractor: options.extractor ?? new ScriptedExtractor(() => []),
    reconciler: options.reconciler ?? new ScriptedReconciler(() => ({ action: "ADD" })),
    queue: { retryDelayMs: 1, ...options.queue },
    onTrace: (trace) => traces.push(trace),
    ...(options.gateThreshold === undefined ? {} : { gateThreshold: options.gateThreshold }),
  });
  if (options.consent !== false) memory.store.recordConsent("memory", true, "test");
  return {
    memory,
    service: memoryService,
    traces,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

let turnCounter = 0;
function userTurn(text: string, sessionId = "s1") {
  return { sessionId, turnId: `t${++turnCounter}`, text };
}

describe("memory write path", () => {
  it("stores nothing without memory consent", async () => {
    const { service: memoryService, memory } = await service({ consent: false });
    expect(memoryService.recordUserTurn(userTurn("Ik woon in Delft."))).toBeUndefined();
    expect(memory.store.countTurns()).toBe(0);
    expect((await memoryService.retrieve("Waar woon ik?")).block).toBe("");
  });

  it("by default passes a turn the gate is only mildly confident about", async () => {
    const gate = new ScriptedGate((state) => ({ worthy: state.includes("Delft") ? 0.15 : 0.05 }));
    const { service: memoryService, traces } = await service({ gate });
    memoryService.recordUserTurn(userTurn("Hoe laat is het?"));
    memoryService.recordUserTurn(userTurn("Mijn zus woont in Delft."));
    await memoryService.drain();
    expect(traces.map((trace) => trace.gate?.worthy)).toEqual([false, true]);
  });

  it("gates turns before extraction and passes the previous assistant turn as context", async () => {
    const gate = new ScriptedGate((state) => ({ worthy: state.includes("Delft") ? 0.9 : 0.05 }));
    const extractor = new ScriptedExtractor((request) =>
      request.userTurn.includes("Delft") ? [fact("De gebruiker woont in Delft.")] : [],
    );
    const { service: memoryService, memory, traces } = await service({ gate, extractor });
    memoryService.recordUserTurn(userTurn("Hoe laat is het?"));
    memoryService.recordAssistantTurn(userTurn("Het is negen uur. Waar woon je eigenlijk?"));
    memoryService.recordUserTurn(userTurn("Ik woon in Delft."));
    await memoryService.drain();

    expect(extractor.requests).toHaveLength(1);
    expect(extractor.requests[0]!.previousAssistantTurn).toBe("Het is negen uur. Waar woon je eigenlijk?");
    expect(gate.states[1]).toContain("Assistant (context only)");
    expect(traces.map((trace) => trace.gate?.worthy)).toEqual([false, true]);
    const items = memory.store.listItems();
    expect(items.map((item) => item.text)).toEqual(["De gebruiker woont in Delft."]);
    expect(memory.store.sourceTurns(items[0]!.id).map((turn) => turn.text)).toEqual(["Ik woon in Delft."]);
  });

  it("applies UPDATE, SUPERSEDE, and NOOP against same-subject neighbours", async () => {
    const extractor = new ScriptedExtractor((request) => [
      fact(request.userTurn, { subject: "Anna", layer: "L4" }),
    ]);
    const reconciler = new ScriptedReconciler((candidate) => {
      const target = candidate.neighbours[0];
      if (!target) return { action: "ADD" };
      if (candidate.item.text.includes("verhuisd")) return { action: "SUPERSEDE", targetId: target.id, text: "Anna woont in Gent." };
      if (candidate.item.text.includes("verpleegkundige")) {
        return { action: "UPDATE", targetId: target.id, text: "Anna woont in Leuven en is verpleegkundige." };
      }
      return { action: "NOOP" };
    });
    const { service: memoryService, memory, traces, advance } = await service({ extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Anna woont in Leuven."));
    await memoryService.drain();
    advance(86_400_000);
    memoryService.recordUserTurn(userTurn("Anna is verpleegkundige."));
    await memoryService.drain();
    memoryService.recordUserTurn(userTurn("Anna woont in Leuven, zei ik al."));
    await memoryService.drain();
    advance(86_400_000);
    memoryService.recordUserTurn(userTurn("Anna is verhuisd naar Gent."));
    await memoryService.drain();

    expect(traces.map((trace) => trace.decisions.map((decision) => decision.action))).toEqual([
      ["ADD"],
      ["UPDATE"],
      ["NOOP"],
      ["SUPERSEDE"],
    ]);
    const [active] = memory.store.listItems({ statuses: ["active"] });
    expect(active!.text).toBe("Anna woont in Gent.");
    const chain = memory.store.supersededChain(active!.id);
    expect(chain.map((item) => item.text)).toEqual(["Anna woont in Leuven en is verpleegkundige."]);
    expect(memory.store.revisions(chain[0]!.id).map((revision) => revision.text)).toEqual([
      "Anna woont in Leuven.",
      "Anna woont in Leuven en is verpleegkundige.",
    ]);
    expect(memory.store.sourceTurns(chain[0]!.id)).toHaveLength(2);
  });

  it("reconciles a restated goal against the stated L7 intention", async () => {
    const extractor = new ScriptedExtractor((request) => [fact(request.userTurn, { layer: "L7" })]);
    const reconciler = new ScriptedReconciler((candidate) =>
      candidate.neighbours[0] ? { action: "UPDATE", targetId: candidate.neighbours[0].id, text: "Wil voor de zomer vijf kilo afvallen en let op wat hij eet." } : { action: "ADD" },
    );
    const { service: memoryService, memory, traces } = await service({ extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Ik wil voor de zomer vijf kilo afvallen."));
    await memoryService.drain();
    memoryService.recordUserTurn(userTurn("Ik let op wat ik eet, want ik wil afvallen."));
    await memoryService.drain();
    expect(traces.map((trace) => trace.decisions.map((decision) => decision.action))).toEqual([["ADD"], ["UPDATE"]]);
    expect(memory.store.listItems({ layers: ["L7"], statuses: ["active"] }).map((item) => item.text)).toEqual([
      "Wil voor de zomer vijf kilo afvallen en let op wat hij eet.",
    ]);
  });

  it("only reconciles against neighbours with the same subject", async () => {
    const extractor = new ScriptedExtractor((request) => [fact(request.userTurn, { subject: request.userTurn.split(" ")[0]! })]);
    const reconciler = new ScriptedReconciler(() => ({ action: "ADD" }));
    const { service: memoryService } = await service({ extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Anna houdt van tennis."));
    memoryService.recordUserTurn(userTurn("Piet houdt van tennis."));
    await memoryService.drain();
    expect(reconciler.calls).toHaveLength(0);
  });

  it("lets a flagged correction supersede an item stored under the mistaken name", async () => {
    const gate = new ScriptedGate((state) => ({ worthy: 0.9, correction: state.includes("vergiste") ? 0.9 : 0 }));
    const extractor = new ScriptedExtractor((request) =>
      request.userTurn.includes("vergiste")
        ? [fact("Ruben is de kleinzoon van de gebruiker.", { subject: "Ruben", layer: "L4" })]
        : [fact("Elke is de kleinzoon van de gebruiker.", { subject: "Elke", layer: "L4" })],
    );
    const reconciler = new ScriptedReconciler((candidate) => {
      const target = candidate.neighbours.find((neighbour) => neighbour.subject === "Elke");
      return target ? { action: "SUPERSEDE", targetId: target.id } : { action: "ADD" };
    });
    const { service: memoryService, memory } = await service({ gate, extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Mijn kleinzoon heet Elke."));
    await memoryService.drain();
    memoryService.recordUserTurn(userTurn("Ik vergiste me: mijn kleinzoon heet niet Elke maar Ruben."));
    await memoryService.drain();
    expect(memory.store.listItems({ statuses: ["active"] }).map((item) => item.subject)).toEqual(["Ruben"]);
  });

  it("keeps an episode repeated on another day as a new occurrence", async () => {
    const extractor = new ScriptedExtractor((request) => [
      fact("De gebruiker ging wandelen in het park.", {
        layer: "L2",
        ...(request.userTurn.includes("gisteren") ? { eventAt: "2026-03-02" } : {}),
      }),
    ]);
    const reconciler = new ScriptedReconciler(() => ({ action: "NOOP" }));
    const { service: memoryService, memory, advance } = await service({ extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Ik ging wandelen in het park."));
    await memoryService.drain();
    memoryService.recordUserTurn(userTurn("Ik ging wandelen in het park, zei ik al."));
    await memoryService.drain();
    expect(memory.store.listItems({ statuses: ["active"] })).toHaveLength(1);
    advance(86_400_000);
    memoryService.recordUserTurn(userTurn("Ik ging weer wandelen in het park."));
    await memoryService.drain();
    expect(memory.store.listItems({ statuses: ["active"] })).toHaveLength(2);
    memoryService.recordUserTurn(userTurn("Ik ging gisteren wandelen in het park."));
    await memoryService.drain();
    expect(memory.store.listItems({ statuses: ["active"] })).toHaveLength(2);
  });

  it("ignores reconciler targets that are not neighbours", async () => {
    const extractor = new ScriptedExtractor((request) => [fact(request.userTurn)]);
    const reconciler = new ScriptedReconciler(() => ({ action: "SUPERSEDE", targetId: 999, text: "x" }));
    const { service: memoryService, memory } = await service({ extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Ik drink graag thee."));
    memoryService.recordUserTurn(userTurn("Ik drink graag koffie."));
    await memoryService.drain();
    expect(memory.store.listItems({ statuses: ["active"] })).toHaveLength(2);
  });

  it("routes transient items to L3 without reconciliation", async () => {
    const extractor = new ScriptedExtractor(() => [fact("De gebruiker is moe vandaag.", { transient: true })]);
    const reconciler = new ScriptedReconciler(() => ({ action: "NOOP" }));
    const { service: memoryService, memory } = await service({ extractor, reconciler });
    memoryService.recordUserTurn(userTurn("Ik ben moe vandaag."));
    memoryService.recordUserTurn(userTurn("Ik ben echt moe vandaag."));
    await memoryService.drain();
    expect(reconciler.calls).toHaveLength(0);
    expect(memory.store.listItems().map((item) => item.layer)).toEqual(["L3", "L3"]);
  });

  it("drops health items unless health consent was given", async () => {
    const extractor = new ScriptedExtractor(() => [
      fact("De gebruiker heeft diabetes.", { sensitivity: "health" }),
      fact("De gebruiker wandelt graag."),
    ]);
    const { service: memoryService, memory, traces } = await service({ extractor });
    memoryService.recordUserTurn(userTurn("Ik heb diabetes en wandel graag."));
    await memoryService.drain();
    expect(memory.store.listItems().map((item) => item.text)).toEqual(["De gebruiker wandelt graag."]);
    expect(traces[0]!.droppedHealth).toBe(1);

    memory.store.recordConsent("health", true, "test");
    memoryService.recordUserTurn(userTurn("Ik heb nog steeds diabetes."));
    await memoryService.drain();
    expect(memory.store.listItems({ sensitivity: "health" })).toHaveLength(1);
  });

  it("keeps health and unprocessed transcripts out of recall without health consent", async () => {
    const extractor = new ScriptedExtractor((request) =>
      request.userTurn.includes("insuline") ? [fact("De gebruiker spuit insuline.", { sensitivity: "health" })] : [],
    );
    const { service: memoryService } = await service({ extractor });
    const health = userTurn("Na de wandeling spuit ik insuline.");
    memoryService.recordUserTurn(health);
    memoryService.recordAssistantTurn({ ...health, text: "Goed dat je na de wandeling aan je insuline denkt." });
    memoryService.recordUserTurn(userTurn("De wandeling langs de Schelde was mooi."));
    await memoryService.drain();
    memoryService.recordUserTurn(userTurn("Morgen weer een wandeling."));

    const texts = async () => (await memoryService.recall({ query: "wandeling" })).excerpts.map((entry) => entry.text);
    expect(await texts()).toEqual(["De wandeling langs de Schelde was mooi."]);
    memoryService.memory.store.recordConsent("health", true, "test");
    expect(await texts()).toHaveLength(4);
  });

  it("drops a health item when health consent is revoked while it is being embedded", async () => {
    const extractor = new ScriptedExtractor(() => [
      fact("De gebruiker heeft diabetes.", { sensitivity: "health" }),
      fact("De gebruiker wandelt graag."),
    ]);
    const { service: memoryService, memory } = await service({ extractor });
    memory.store.recordConsent("health", true, "test");
    const embed = memory.embedder.embed.bind(memory.embedder);
    Object.assign(memory.embedder, {
      embed: (...args: Parameters<typeof embed>) => {
        memory.store.recordConsent("health", false, "test");
        return embed(...args);
      },
    });
    memoryService.recordUserTurn(userTurn("Ik heb diabetes en wandel graag."));
    await memoryService.drain();
    expect(memory.store.listItems().map((item) => item.text)).toEqual(["De gebruiker wandelt graag."]);
  });

  it("does not process queued turns after memory consent is revoked", async () => {
    const extractor = new ScriptedExtractor(() => [fact("De gebruiker woont in Delft.")]);
    const { service: memoryService, memory } = await service({ extractor });
    memoryService.recordUserTurn(userTurn("Ik woon in Delft."));
    memory.store.recordConsent("memory", false, "test");
    await memoryService.drain();
    expect(extractor.requests).toHaveLength(0);
    expect(memory.store.listItems()).toHaveLength(0);
  });

  it("removes credentials before storage and extraction", async () => {
    const extractor = new ScriptedExtractor(() => []);
    const { service: memoryService, memory } = await service({ extractor });
    const turn = memoryService.recordUserTurn(userTurn("Mijn wachtwoord is Zomer2026!x, onthoud dat."));
    await memoryService.drain();
    expect(memory.store.getTurn(turn!.id)!.text).not.toContain("Zomer2026");
    expect(extractor.requests[0]!.userTurn).not.toContain("Zomer2026");
    expect(memory.store.listAudit().map((entry) => entry.action)).toContain("turn.credential-removed");
  });

  it("keeps the L1 turn and retries when extraction fails", async () => {
    let failures = 2;
    const extractor = new ScriptedExtractor(() => {
      if (failures-- > 0) throw new Error("model offline");
      return [fact("De gebruiker heet Erik.")];
    });
    const { service: memoryService, memory, advance } = await service({ extractor });
    memoryService.recordUserTurn(userTurn("Ik heet Erik."));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await memoryService.drain();
      advance(60_000);
    }
    expect(memory.store.countTurns()).toBe(1);
    expect(memory.store.listItems()).toHaveLength(1);
    expect(memoryService.queue.failedJobs()).toEqual([]);
  });

  it("resumes interrupted jobs after a restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sodalis-memory-"));
    const path = join(directory, "memory.db");
    try {
      const hanging = new ScriptedExtractor(() => new Promise<never>(() => undefined));
      const first = await service({ path, extractor: hanging });
      first.service.recordUserTurn(userTurn("Mijn verjaardag is op 12 mei."));
      first.service.flush();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(hanging.requests).toHaveLength(1);
      first.memory.close(); // simulated crash: the job stays "running"

      const extractor = new ScriptedExtractor(() => [fact("De verjaardag van de gebruiker is op 12 mei.")]);
      const second = await service({ path, extractor, consent: false });
      second.service.start();
      await second.service.drain();
      expect(second.memory.store.listItems()).toHaveLength(1);
      await second.service.stop();
      second.memory.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("stores observations with observed provenance and never health details", async () => {
    const extractor = new ScriptedExtractor(() => [
      fact("De gebruiker kookt elke avond om zes uur."),
      fact("De gebruiker neemt medicijnen.", { sensitivity: "health" }),
    ]);
    const gate = new ScriptedGate(() => ({ worthy: 0 }));
    const { service: memoryService, memory, traces } = await service({ extractor, gate });
    memory.store.recordConsent("health", true, "test");
    memoryService.recordObservation({ source: "home", text: "Kookplaat aan om 18:00, vijfde dag op rij." });
    await memoryService.drain();
    expect(gate.states).toHaveLength(0);
    expect(extractor.requests[0]!.userTurn).toContain("Observed event from home");
    const items = memory.store.listItems();
    expect(items.map((item) => [item.text, item.provenance])).toEqual([
      ["De gebruiker kookt elke avond om zes uur.", "observed"],
    ]);
    expect(traces[0]!.droppedObservationHealth).toBe(1);
    expect(() => memoryService.recordObservation({ source: "Bad Source!", text: "x" })).toThrow(RangeError);
  });
});

describe("write-path components", () => {
  it("tells the extractor to keep the language of the user's message", () => {
    expect(detectLanguage("Hi, my name is Oliver and I like drawing animals.")).toBe("en");
    expect(detectLanguage("Ik voel me vandaag wat somber, en mijn knie doet pijn.")).toBe("nl");
    expect(detectLanguage("Oké")).toBeUndefined();
    expect(extractionUserPrompt({ userTurn: "I have a dog called Max.", turnTime: "2026-02-03T10:00:00Z" })).toContain(
      "Write every text in English",
    );
    expect(extractionUserPrompt({ userTurn: "Ik heb een hond die Max heet.", turnTime: "2026-02-03T10:00:00Z" })).toContain(
      "Write every text in Dutch",
    );
  });

  it("redacts labelled secrets, API keys, and card numbers", () => {
    expect(redactCredentials("pincode: 4821").text).toBe("pincode: [credential removed]");
    expect(redactCredentials("key sk-abcdefghijklmnopqrstuvwx1234").found).toBe(true);
    expect(redactCredentials("kaart 4111 1111 1111 1111").text).toContain("[credential removed]");
    expect(redactCredentials("Ik ben 1 februari 1960 geboren.").found).toBe(false);
  });

  it("parses and validates extractor output", () => {
    const items = parseExtractedItems({
      items: [
        { layer: "L2", subject: "user", text: "Tandarts", event_at: "2026-03-10", sensitivity: "general", provenance: "stated", transient: false },
        { layer: "L7", subject: "user", text: "Wil Spaans leren", sensitivity: "general", provenance: "stated", transient: false },
        { layer: "L9", subject: "user", text: "invalid layer" },
        { layer: "L4", subject: "", text: "missing subject" },
        { layer: "L4", subject: "Anna", text: "Dochter", event_at: "volgende week", sensitivity: "health", provenance: "inferred" },
      ],
    });
    expect(items).toEqual([
      { layer: "L2", subject: "user", text: "Tandarts", eventAt: "2026-03-10", sensitivity: "general", provenance: "stated", transient: false },
      { layer: "L7", subject: "user", text: "Wil Spaans leren", sensitivity: "general", provenance: "stated", transient: false },
      { layer: "L4", subject: "Anna", text: "Dochter", sensitivity: "health", provenance: "inferred", transient: false },
    ]);
  });

  it("sanitises reconciler decisions", () => {
    const neighbour = { id: 7 } as never;
    const candidates = [
      { item: fact("a"), neighbours: [neighbour] },
      { item: fact("b"), neighbours: [neighbour] },
    ];
    expect(
      sanitiseDecisions(candidates, [
        { index: 0, action: "UPDATE", targetId: 7, text: "merged" },
        { index: 1, action: "SUPERSEDE", targetId: 7 },
      ]),
    ).toEqual([
      { index: 0, action: "UPDATE", targetId: 7, text: "merged" },
      { index: 1, action: "ADD" },
    ]);
  });

  it("reads gate probabilities from first-token log-probabilities", async () => {
    const client: ChatClient = {
      id: "fake",
      async complete(request: ChatCompletionRequest): Promise<ChatCompletion> {
        const prompt = request.messages.at(-1)!.content;
        if (prompt.includes("Options:\nA) yes")) {
          return {
            content: "A",
            firstTokenLogprobs: [
              { token: "A", logprob: Math.log(0.6) },
              { token: " B", logprob: Math.log(0.2) },
              { token: "C", logprob: Math.log(0.2) },
            ],
          };
        }
        return { content: "C" };
      },
    };
    const response = await new LlmDecisionGate(client).decide({
      state: "User: Anna is jarig op 3 juni.",
      questions: [
        { key: "worthy", type: "noul", question: "Worth remembering?" },
        { key: "kind", type: "choice", question: "Kind?", choices: ["fact", "preference", "person"] },
      ],
    });
    expect(response.answers[0]).toMatchObject({ key: "worthy", type: "noul" });
    expect((response.answers[0] as { noul: number }).noul).toBeCloseTo(0.75);
    expect(response.answers[1]).toMatchObject({ choice: "person" });
  });
});
