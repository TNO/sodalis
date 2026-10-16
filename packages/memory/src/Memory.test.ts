import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Memory, MockEmbedder, reciprocalRankFusion, type Embedder } from "./index.js";

function clockAt(iso: string) {
  let now = new Date(iso);
  const clock = () => now;
  return {
    clock,
    set(value: string) {
      now = new Date(value);
    },
  };
}

async function openMemory(options: { embedder?: Embedder; clock?: () => Date; path?: string } = {}) {
  return Memory.open({
    path: options.path ?? ":memory:",
    embedder: options.embedder ?? new MockEmbedder(),
    ...(options.clock ? { clock: options.clock } : {}),
  });
}

describe("memory storage", () => {
  it("stores turns and items with provenance links", async () => {
    const memory = await openMemory();
    const turn = memory.store.appendTurn({
      sessionId: "s1",
      turnId: "t1",
      role: "user",
      text: "Mijn dochter heet Anna.",
      language: "nl",
    });
    const item = await memory.addItem({
      layer: "L4",
      subject: "Anna",
      text: "Anna is de dochter van de gebruiker.",
      sourceTurnIds: [turn.id],
    });
    expect(item).toMatchObject({
      layer: "L4",
      subject: "Anna",
      status: "active",
      sensitivity: "general",
      provenance: "stated",
      revision: 1,
    });
    expect(memory.store.sourceTurns(item.id).map((source) => source.text)).toEqual([
      "Mijn dochter heet Anna.",
    ]);
    expect(memory.store.listItems({ subject: "anna" })).toHaveLength(1);
  });

  it("keeps revisions when an item is updated", async () => {
    const memory = await openMemory();
    const item = await memory.addItem({ layer: "L2", subject: "user", text: "Woont in Brugge." });
    const updated = await memory.updateItem(item.id, { text: "Woont in Brugge, nabij het station.", reason: "update" });
    expect(updated.revision).toBe(2);
    expect(memory.store.revisions(item.id).map((revision) => revision.text)).toEqual([
      "Woont in Brugge.",
      "Woont in Brugge, nabij het station.",
    ]);
  });

  it("supersedes items and keeps the chain traversable", async () => {
    const time = clockAt("2026-01-01T10:00:00.000Z");
    const memory = await openMemory({ clock: time.clock });
    const first = await memory.addItem({ layer: "L2", subject: "user", text: "Woont in Brugge." });
    time.set("2026-02-01T10:00:00.000Z");
    const second = await memory.supersede(first.id, { layer: "L2", subject: "user", text: "Woont in Gent." });
    time.set("2026-03-01T10:00:00.000Z");
    const third = await memory.supersede(second.id, { layer: "L2", subject: "user", text: "Woont in Leuven." });

    expect(memory.store.getItem(first.id)).toMatchObject({
      status: "superseded",
      validTo: "2026-02-01T10:00:00.000Z",
    });
    expect(memory.store.supersededChain(third.id).map((item) => item.text)).toEqual([
      "Woont in Gent.",
      "Woont in Brugge.",
    ]);
    expect(memory.store.supersededBy(first.id)?.id).toBe(second.id);
    const results = await memory.search("Woont in Brugge", { limit: 5 });
    expect(results.map((result) => result.item.id)).toEqual([third.id]);
  });

  it("purges expired transcripts but keeps derived items", async () => {
    const time = clockAt("2026-01-01T10:00:00.000Z");
    const memory = await openMemory({ clock: time.clock });
    expect(memory.store.getRetention()).toBe("90d");
    const old = memory.store.appendTurn({ sessionId: "s1", turnId: "t1", role: "user", text: "Anna is jarig op 3 mei." });
    const item = await memory.addItem({
      layer: "L2",
      subject: "Anna",
      text: "Anna is jarig op 3 mei.",
      sourceTurnIds: [old.id],
    });
    memory.store.setRetention("7d");
    time.set("2026-01-05T10:00:00.000Z");
    const recent = memory.store.appendTurn({ sessionId: "s1", turnId: "t2", role: "user", text: "Goedemorgen" });
    time.set("2026-01-09T10:00:00.000Z");

    expect(memory.store.purgeExpiredTurns()).toBe(1);
    expect(memory.store.getTurn(old.id)).toBeUndefined();
    expect(memory.store.getTurn(recent.id)).toBeDefined();
    expect(memory.store.getItem(item.id)).toBeDefined();
    expect(memory.store.sourceTurns(item.id)).toEqual([]);

    memory.store.setRetention("forever");
    time.set("2030-01-01T10:00:00.000Z");
    expect(memory.store.purgeExpiredTurns()).toBe(0);
    memory.store.setRetention("off");
    expect(memory.store.purgeExpiredTurns()).toBe(1);
  });

  it("hard-deletes an item, its revisions, and its index entry", async () => {
    const memory = await openMemory();
    const item = await memory.addItem({ layer: "L2", subject: "user", text: "Houdt van tulpen." });
    await memory.updateItem(item.id, { text: "Houdt van gele tulpen.", reason: "update" });
    expect(memory.index.count()).toBe(1);

    expect(memory.deleteItem(item.id)).toBe(true);
    expect(memory.store.getItem(item.id)).toBeUndefined();
    expect(memory.store.revisions(item.id)).toEqual([]);
    expect(memory.index.count()).toBe(0);
    expect(await memory.search("tulpen")).toEqual([]);
    expect(memory.deleteItem(item.id)).toBe(false);
    const audit = memory.store.listAudit();
    expect(audit[0]).toMatchObject({ action: "item.delete", itemId: item.id });
    expect(JSON.stringify(audit)).not.toContain("tulpen");
  });

  it("deleting a superseded item cuts the chain at that item", async () => {
    const memory = await openMemory();
    const first = await memory.addItem({ layer: "L2", subject: "user", text: "Drinkt koffie zwart." });
    const second = await memory.supersede(first.id, { layer: "L2", subject: "user", text: "Drinkt koffie met melk." });
    memory.deleteItem(first.id);
    expect(memory.store.supersededChain(second.id)).toEqual([]);
  });

  it("records consent with its policy version", async () => {
    const memory = await openMemory();
    expect(memory.store.hasConsent("memory")).toBe(false);
    memory.store.recordConsent("memory", true, "2026-05");
    memory.store.recordConsent("health", false, "2026-05");
    expect(memory.store.consent("memory")).toMatchObject({ granted: true, policyVersion: "2026-05" });
    expect(memory.store.hasConsent("health")).toBe(false);
  });
});

describe("memory index", () => {
  it("merges vector and keyword ranks with reciprocal rank fusion", () => {
    const scores = reciprocalRankFusion([
      [1, 2, 3],
      [3, 4],
    ]);
    expect([...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]).toBe(3);
  });

  it("finds items by keyword and by vector, filtered by layer and subject", async () => {
    const memory = await openMemory();
    const tulips = await memory.addItem({ layer: "L4", subject: "user", text: "Houdt van tulpen en rozen." });
    const doctor = await memory.addItem({
      layer: "L2",
      subject: "user",
      text: "Afspraak met huisarts Peeters op dinsdag.",
      eventAt: "2026-05-12T09:00:00.000Z",
    });
    await memory.addItem({ layer: "L3", subject: "Anna", text: "Anna was moe na het werk." });

    const keyword = await memory.search("Wanneer is de afspraak bij Peeters?");
    expect(keyword[0]?.item.id).toBe(doctor.id);
    expect(keyword[0]?.hit.textRank).toBe(0);

    const layered = await memory.search("tulpen", { layers: ["L2", "L3"] });
    expect(layered.map((result) => result.item.id)).not.toContain(tulips.id);

    const subject = await memory.search("moe", { subject: "ANNA" });
    expect(subject.map((result) => result.item.subject)).toEqual(["Anna"]);
  });

  it("rebuilds the index when the embedding model changes or on request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sodalis-memory-"));
    const path = join(directory, "memory.sqlite");
    const first = await openMemory({ path, embedder: new MockEmbedder(32, "mock-a") });
    await first.addItem({ layer: "L2", subject: "user", text: "Speelt graag bridge." });
    first.close();

    const second = await openMemory({ path, embedder: new MockEmbedder(48, "mock-b") });
    expect(second.index.descriptor).toEqual({ model: "mock-b", dimensions: 48 });
    expect(second.index.count()).toBe(1);
    expect((await second.search("bridge"))[0]?.item.text).toBe("Speelt graag bridge.");
    expect(await second.rebuildIndex()).toBe(1);
    second.close();
    await rm(directory, { recursive: true, force: true });
  });
});
