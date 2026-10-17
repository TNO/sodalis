import { describe, expect, it } from "vitest";
import { formatRecallResult, Memory, MockEmbedder, recallMemory, retrieveMemories, type NewMemoryItem } from "./index.js";

const NOW = "2026-03-02T09:00:00.000Z";

async function openMemory() {
  let now = new Date(NOW);
  const memory = await Memory.open({ path: ":memory:", embedder: new MockEmbedder(), clock: () => now });
  return {
    memory,
    at(iso: string) {
      now = new Date(iso);
    },
  };
}

function item(text: string, overrides: Partial<NewMemoryItem> = {}): NewMemoryItem {
  return { layer: "L2", subject: "user", text, ...overrides };
}

describe("memory retrieval", () => {
  it("returns an empty block when nothing is relevant", async () => {
    const { memory } = await openMemory();
    await memory.addItem(item("De gebruiker speelt graag schaak."));
    const result = await retrieveMemories(memory, { userTurn: "Welk weer wordt het morgen?" });
    expect(result.block).toBe("");
    expect(result.estimatedTokens).toBe(0);
  });

  it("selects relevant items by layer quota with date and provenance", async () => {
    const { memory } = await openMemory();
    for (const sport of ["tennis", "tennisles", "tennisbaan", "tennisclub"]) {
      await memory.addItem(item(`De gebruiker houdt van tennis en ${sport}.`, { provenance: "inferred" }));
    }
    await memory.addItem(item("De gebruiker kookt graag Italiaans."));
    const result = await retrieveMemories(
      memory,
      { userTurn: "Zullen we het over tennis hebben?", now: new Date(NOW) },
      { quotas: { L2: 2 } },
    );
    expect(result.items.map((entry) => entry.reason)).toEqual(["relevant", "relevant"]);
    expect(result.block).toContain("Today: 2026-03-02");
    expect(result.block).toMatch(/- \[2026-03-02, inferred\] De gebruiker houdt van tennis/);
    expect(result.block).not.toContain("Italiaans");
  });

  it("pins profile, identity, intentions, and upcoming dates regardless of the query", async () => {
    const { memory } = await openMemory();
    await memory.addItem(item("De gebruiker heet Erik.", { layer: "L0" }));
    await memory.addItem(item("Anna is de dochter van de gebruiker.", { layer: "L4", subject: "Anna" }));
    await memory.addItem(item("De gebruiker wil voor de zomer afvallen.", { layer: "L7", provenance: "inferred" }));
    await memory.addItem(item("Tandartsafspraak", { eventAt: "2026-03-10" }));
    await memory.addItem(item("Verjaardag Piet", { eventAt: "2026-05-01" }));
    await memory.addItem(item("Oude afspraak", { eventAt: "2026-02-01" }));
    const result = await retrieveMemories(memory, { userTurn: "Hallo!", now: new Date(NOW) });
    expect(result.items.map((entry) => [entry.reason, entry.item.text])).toEqual([
      ["profile", "De gebruiker heet Erik."],
      ["upcoming", "Tandartsafspraak"],
      ["identity", "Anna is de dochter van de gebruiker."],
      ["intention", "De gebruiker wil voor de zomer afvallen."],
    ]);
    expect(result.block).toContain("Tandartsafspraak (date: 2026-03-10)");
    expect(result.block).toContain("Anna: Anna is de dochter");
  });

  it("does not prefix subjects that mean the user", async () => {
    const { memory } = await openMemory();
    await memory.addItem(item("De gebruiker wil Spaans leren.", { layer: "L7", subject: "De gebruiker" }));
    const result = await retrieveMemories(memory, { userTurn: "Hallo!", now: new Date(NOW) });
    expect(result.block).toContain("] De gebruiker wil Spaans leren.");
  });

  it("marks intentions as goals so they are not confused with appointments", async () => {
    const { memory } = await openMemory();
    await memory.addItem(item("De gebruiker wil Spaans leren.", { layer: "L7" }));
    const result = await retrieveMemories(memory, { userTurn: "Wat ben ik van plan?", now: new Date(NOW) });
    expect(result.block).toMatch(/\[\d{4}-\d{2}-\d{2}, stated, goal\] De gebruiker wil Spaans leren\./);
    expect(result.block).toContain("'goal' items are the user's ongoing goals");
  });

  it("shows superseded history as a dated chain", async () => {
    const { memory, at } = await openMemory();
    const old = await memory.addItem(item("Anna woont in Leuven.", { layer: "L4", subject: "Anna" }));
    at("2026-02-20T10:00:00.000Z");
    await memory.supersede(old.id, item("Anna woont in Gent.", { layer: "L4", subject: "Anna" }));
    const result = await retrieveMemories(memory, { userTurn: "Waar woont Anna?", now: new Date(NOW) });
    expect(result.block).toContain('Anna: now "Anna woont in Gent."; was "Anna woont in Leuven." until 2026-02-20');
  });

  it("leaves health items out of the superseded history without consent", async () => {
    const { memory } = await openMemory();
    const old = await memory.addItem(item("De gebruiker neemt metformine voor diabetes.", { sensitivity: "health" }));
    await memory.supersede(old.id, item("De gebruiker wandelt elke ochtend."));
    const result = await retrieveMemories(memory, { userTurn: "Wat doet de gebruiker elke ochtend?" });
    expect(result.block).toContain("wandelt elke ochtend");
    expect(result.block).not.toContain("metformine");
    const withHealth = await retrieveMemories(memory, { userTurn: "Wat doet de gebruiker elke ochtend?" }, { includeHealth: true });
    expect(withHealth.block).toContain("metformine");
  });

  it("respects the token budget and excludes health items without consent", async () => {
    const { memory } = await openMemory();
    await memory.addItem(item("De gebruiker heeft diabetes en wandelt.", { sensitivity: "health" }));
    for (let index = 0; index < 6; index += 1) {
      await memory.addItem(item(`De gebruiker wandelt graag op route ${index} door het bos met een lange beschrijving.`));
    }
    const small = await retrieveMemories(memory, { userTurn: "Waar wandelt de gebruiker graag?" }, { tokenBudget: 150 });
    expect(small.estimatedTokens).toBeLessThanOrEqual(150);
    expect(small.items.length).toBeGreaterThan(0);
    expect(small.items.length).toBeLessThan(6);
    const full = await retrieveMemories(memory, { userTurn: "Waar wandelt de gebruiker graag?" });
    expect(full.block).not.toContain("diabetes");
    const withHealth = await retrieveMemories(memory, { userTurn: "Waar wandelt de gebruiker graag?" }, { includeHealth: true });
    expect(withHealth.block).toContain("diabetes");
  });
});

describe("episodic recall", () => {
  it("returns dated summary and transcript excerpts within a date range", async () => {
    const { memory, at } = await openMemory();
    at("2026-01-15T10:00:00.000Z");
    await memory.addItem(item("De gebruiker vertelde over de vakantie in Italië.", { layer: "L3" }));
    memory.store.appendTurn({ sessionId: "s", turnId: "a", role: "user", text: "We gingen naar Rome op vakantie." });
    at("2026-02-15T10:00:00.000Z");
    memory.store.appendTurn({ sessionId: "s", turnId: "b", role: "user", text: "Vakantie in Spanje gepland." });

    const result = await recallMemory(memory, { query: "vakantie", from: "2026-01-01", to: "2026-01-31" });
    expect(result.excerpts.map((entry) => [entry.source, entry.date])).toEqual([
      ["summary", "2026-01-15"],
      ["transcript", "2026-01-15"],
    ]);
    expect(formatRecallResult(result)).toContain("[2026-01-15, transcript, user] We gingen naar Rome");
    expect(formatRecallResult({ excerpts: [] })).toBe("No matching memories were found.");
  });

  it("truncates long excerpts", async () => {
    const { memory } = await openMemory();
    memory.store.appendTurn({ sessionId: "s", turnId: "a", role: "user", text: `Fietstocht ${"lang ".repeat(200)}` });
    const result = await recallMemory(memory, { query: "fietstocht" });
    expect(result.excerpts[0]!.text.length).toBeLessThanOrEqual(300);
  });
});
