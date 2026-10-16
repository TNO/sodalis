import { describe, expect, it } from "vitest";
import { Memory, MemoryService, MockEmbedder } from "@sodalis/memory";
import { fact, ScriptedExtractor, ScriptedGate, ScriptedReconciler } from "@sodalis/memory/testing";
import { createAssistantApp } from "./app.js";
import { createMemoryFromEnv } from "./memoryConfig.js";
import {
  memoryPrompt,
  RECALL_MEMORY_INSTRUCTION,
  type LlmGenerationRequest,
  type LlmTextGenerationProvider,
} from "./OpenAiCompatibleLlmProvider.js";

const utterance = (text: string) =>
  JSON.stringify({ text, affect: { expression: "neutral", valence: 0, arousal: 0.1, intensity: 0.1 }, interruptible: true });

async function setup(options: { consent?: boolean; replies?: string[]; extractor?: ScriptedExtractor } = {}) {
  const memory = await Memory.open({ path: ":memory:", embedder: new MockEmbedder() });
  const extractor =
    options.extractor ??
    new ScriptedExtractor((request) =>
      request.userTurn.includes("Delft") ? [fact("De gebruiker woont in Delft.")] : [],
    );
  const service = new MemoryService({
    memory,
    gate: new ScriptedGate(() => ({ worthy: 1 })),
    extractor,
    reconciler: new ScriptedReconciler(() => ({ action: "ADD" })),
  });
  if (options.consent !== false) memory.store.recordConsent("memory", true, "test");
  const requests: LlmGenerationRequest[] = [];
  const replies = [...(options.replies ?? [])];
  const provider: LlmTextGenerationProvider = {
    id: "fake",
    async *generate(request) {
      requests.push(request);
      const reply = replies.shift() ?? utterance("Prima.");
      for (let index = 0; index < reply.length; index += 7) yield reply.slice(index, index + 7);
    },
  };
  const app = createAssistantApp({ provider, memory: service, observationSources: ["home", "app:calendar"] });
  const turn = (turnId: string, messages: { role: "user" | "assistant"; content: string }[], sessionId = "s1") =>
    app.request("/api/assistant/turns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, turnId, messages }),
    });
  const json = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  return { app, memory, service, requests, turn, json, extractor };
}

function streamedText(body: string): string {
  return body
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => (JSON.parse(frame.slice(6)) as { text: string }).text)
    .join("");
}

describe("assistant memory integration", () => {
  it("records turns, extracts after the reply, and injects memories in later turns", async () => {
    const { requests, turn, service, memory } = await setup();
    await (await turn("t1", [{ role: "user", content: "Ik woon in Delft." }])).text();
    await service.drain();
    expect(memory.store.listTurns().map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Ik woon in Delft."],
      ["assistant", "Prima."],
    ]);
    expect(memory.store.listItems().map((item) => item.text)).toEqual(["De gebruiker woont in Delft."]);

    await (await turn("t2", [{ role: "user", content: "Waar woont de gebruiker?" }], "s2")).text();
    expect(requests[1]!.memoryContext).toContain("De gebruiker woont in Delft.");
    expect(requests[1]!.memoryContext).toContain("stated");
  });

  it("sends the live session and memory block but never stored transcripts", async () => {
    const { requests, turn, service } = await setup();
    await (await turn("t1", [{ role: "user", content: "Ik woon in Delft, mijn geheime hobby is X." }], "old")).text();
    await service.drain();
    const messages = [
      { role: "user" as const, content: "Hallo" },
      { role: "assistant" as const, content: utterance("Hoi!") },
      { role: "user" as const, content: "Woon ik in Delft?" },
    ];
    await (await turn("t2", messages, "new")).text();
    const request = requests.at(-1)!;
    expect(request.messages).toEqual(messages);
    expect(JSON.stringify(request)).not.toContain("geheime hobby");
    expect(request.memoryContext).toContain("Delft");
  });

  it("does nothing without memory consent", async () => {
    const { requests, turn, memory } = await setup({ consent: false });
    await (await turn("t1", [{ role: "user", content: "Ik woon in Delft." }])).text();
    expect(memory.store.countTurns()).toBe(0);
    expect(requests[0]!.memoryContext).toBeUndefined();
    expect(requests[0]!.recallAvailable).toBeUndefined();
  });

  it("answers recall_memory requests with a second generation", async () => {
    const { requests, turn, memory } = await setup({
      replies: [
        ' {"recall_memory": {"query": "vakantie Rome", "from": "2020-01-01"}}',
        utterance("Je was in Rome."),
      ],
    });
    memory.store.appendTurn({ sessionId: "old", turnId: "x", role: "user", text: "We gingen op vakantie naar Rome." });
    const body = await (await turn("t1", [{ role: "user", content: "Waar was ik op vakantie?" }])).text();
    expect(streamedText(body)).toBe(utterance("Je was in Rome."));
    expect(requests[0]!.recallAvailable).toBe(true);
    expect(requests[1]!.recalledContext?.query).toBe("vakantie Rome");
    expect(requests[1]!.recalledContext?.excerpts).toContain("We gingen op vakantie naar Rome.");
    expect(memoryPrompt(requests[1]!)).not.toContain(RECALL_MEMORY_INSTRUCTION);
  });

  it("streams normal replies even when memory and recall are enabled", async () => {
    const { turn } = await setup({ replies: [utterance("Gewoon antwoord.")] });
    const body = await (await turn("t1", [{ role: "user", content: "Hoi" }])).text();
    expect(streamedText(body)).toBe(utterance("Gewoon antwoord."));
  });
});

describe("memory API", () => {
  it("records consent and reports status", async () => {
    const { json } = await setup({ consent: false });
    expect((await json("/api/memory/consent", "PUT", { kind: "memory" })).status).toBe(400);
    expect((await json("/api/memory/consent", "PUT", { kind: "health", granted: true })).status).toBe(200);
    expect((await json("/api/memory/consent", "PUT", { kind: "memory", granted: true })).status).toBe(200);
    const status = (await (await json("/api/memory/status", "GET")).json()) as {
      active: boolean;
      consent: Record<string, { granted: boolean } | null>;
      retention: string;
    };
    expect(status.active).toBe(true);
    expect(status.consent.health?.granted).toBe(true);
    expect(status.retention).toBe("90d");
  });

  it("corrects an item with a revision, explains provenance, and deletes it", async () => {
    const { json, turn, service } = await setup();
    await (await turn("t1", [{ role: "user", content: "Ik woon in Delft." }])).text();
    await service.drain();
    const { items } = (await (await json("/api/memory/items", "GET")).json()) as { items: { id: number }[] };
    const id = items[0]!.id;

    const corrected = await json(`/api/memory/items/${id}`, "PATCH", { text: "De gebruiker woont in Leiden." });
    expect(corrected.status).toBe(200);
    const detail = (await (await json(`/api/memory/items/${id}`, "GET")).json()) as {
      item: { text: string; revision: number };
      revisions: { reason: string }[];
      sources: { role: string }[];
    };
    expect(detail.item).toMatchObject({ text: "De gebruiker woont in Leiden.", revision: 2 });
    expect(detail.revisions.map((revision) => revision.reason)).toEqual(["created", "user-correction"]);
    expect(detail.sources.map((source) => source.role)).toEqual(["user"]);

    const about = (await (await json("/api/memory/about?q=Leiden", "GET")).json()) as {
      items: { text: string; provenance: string }[];
    };
    expect(about.items).toEqual([expect.objectContaining({ text: "De gebruiker woont in Leiden.", provenance: "stated" })]);

    expect((await json(`/api/memory/items/${id}`, "DELETE")).status).toBe(204);
    expect((await json(`/api/memory/items/${id}`, "GET")).status).toBe(404);
    expect(await (await json("/api/memory/search?q=Leiden", "GET")).json()).toEqual({ items: [] });
  });

  it("deletes transcripts and sets retention", async () => {
    const { json, turn, memory } = await setup();
    await (await turn("t1", [{ role: "user", content: "Hallo daar." }])).text();
    expect((await json("/api/memory/retention", "PUT", { retention: "1y" })).status).toBe(400);
    expect((await json("/api/memory/retention", "PUT", { retention: "7d" })).status).toBe(200);
    const deleted = (await (await json("/api/memory/transcripts", "DELETE")).json()) as { deletedTurns: number };
    expect(deleted.deletedTurns).toBe(2);
    expect(memory.store.countTurns()).toBe(0);
  });

  it("accepts observations only from allowed sources and marks them observed", async () => {
    const extractor = new ScriptedExtractor(() => [fact("De gebruiker kookt om zes uur.")]);
    const { json, service, memory } = await setup({ extractor });
    expect((await json("/api/memory/observations", "POST", { source: "mail", text: "x" })).status).toBe(403);
    const accepted = await json("/api/memory/observations", "POST", {
      source: "home",
      text: "Kookplaat aan om 18:00.",
      eventId: "evt-1",
    });
    expect(accepted.status).toBe(202);
    await json("/api/memory/observations", "POST", { source: "home", text: "Kookplaat aan om 18:00.", eventId: "evt-1" });
    await service.drain();
    expect(memory.store.listTurns().map((entry) => [entry.role, entry.source])).toEqual([["observation", "home"]]);
    expect(memory.store.listItems().map((item) => item.provenance)).toEqual(["observed"]);
  });
});

describe("memory configuration", () => {
  it("is off by default and validates settings when enabled", async () => {
    expect(await createMemoryFromEnv({})).toBeUndefined();
    await expect(createMemoryFromEnv({ MEMORY_ENABLED: "true" })).rejects.toThrow("MEMORY_EMBED_BASE_URL");
    await expect(
      createMemoryFromEnv({
        MEMORY_ENABLED: "true",
        MEMORY_EMBED_PROVIDER: "mock",
        MEMORY_GATE_PROVIDER: "pass-through",
        MEMORY_EXTRACT_BASE_URL: "http://127.0.0.1:8000/v1",
        MEMORY_EXTRACT_MODEL: "qwen",
        MEMORY_EXTRACT_EXTRA_BODY: "[1]",
      }),
    ).rejects.toThrow("MEMORY_EXTRACT_EXTRA_BODY must be a JSON object");
    const runtime = await createMemoryFromEnv({
      MEMORY_ENABLED: "true",
      MEMORY_DB_PATH: ":memory:",
      MEMORY_EMBED_PROVIDER: "mock",
      MEMORY_GATE_PROVIDER: "pass-through",
      MEMORY_EXTRACT_BASE_URL: "http://127.0.0.1:8000/v1",
      MEMORY_EXTRACT_MODEL: "qwen",
      MEMORY_OBSERVATION_SOURCES: "home, app:calendar",
    });
    expect(runtime?.observationSources).toEqual(["home", "app:calendar"]);
    expect(runtime?.service.active()).toBe(false);
    runtime?.service.memory.close();
  });
});
