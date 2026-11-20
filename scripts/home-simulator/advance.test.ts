import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { advanceReplay, describeAdvance } from "./advance.js";
import { createReplaySession } from "./session.js";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const batchScript = [
  { events: 5, pages: 3, time: "2025-02-15T09:30:00+00:00", person: "jo" },
  { events: 0, pages: 2, time: "2025-02-15T18:30:00+00:00", person: "sam" },
  { events: 1, pages: 1, time: "2025-02-16T23:00:00+00:00", reason: "end_of_dataset" },
];

async function setup(state: object = {}) {
  const root = mkdtempSync(resolve(".test-home-simulator-"));
  directories.push(root);
  writeFileSync(resolve(root, "fixture.json"), JSON.stringify({ batchScript, ...state }));
  const launch = { command: process.execPath, args: [resolve("scripts/home-simulator/fixtures/mcp-server.mjs")] };
  const handoffPath = resolve(root, "session.json");
  await createReplaySession({ root, stateDir: root, handoffPath, pollIntervalMs: 1, launch });
  const avatarCalls = () => (JSON.parse(readFileSync(resolve(root, "fixture.json"), "utf8")).calls as
    { role: string; name: string; arguments: Record<string, unknown> }[])
    .filter((call) => call.role === "avatar" && call.name.includes("batch"));
  return { root, handoffPath, launch, avatarCalls };
}

it("reads every page before acknowledging the batch as a context checkpoint", async () => {
  const { handoffPath, launch, avatarCalls } = await setup();
  const result = await advanceReplay({ handoffPath, launch });
  expect(result).toEqual({ status: "advanced", batchId: "batch-1", eventCount: 5,
    simulationTime: "2025-02-15T09:30:00+00:00",
    nextInteraction: { timestamp: "2025-02-15T09:30:00+00:00", person: "jo" } });
  expect(avatarCalls().map((call) => [call.name, call.arguments])).toEqual([
    ["next_interaction_batch", {}],
    ["next_interaction_batch", { page_token: "batch-1:2" }],
    ["next_interaction_batch", { page_token: "batch-1:3" }],
    ["acknowledge_batch", { batch_id: "batch-1", memory_checkpoint_id: "sodalis-advance-batch-1", memory_kind: "context" }],
  ]);
  expect(describeAdvance(result)).toContain("2025-02-15T09:30:00+00:00");
  expect(describeAdvance(result)).toContain("jo");
});

it("re-reads the pending batch from page 1 after an acknowledgement failure without skipping observations", async () => {
  const { handoffPath, launch, avatarCalls } = await setup({ ackFailures: 1 });
  await expect(advanceReplay({ handoffPath, launch })).rejects.toThrow("Fixture acknowledgement failed");
  const retry = await advanceReplay({ handoffPath, launch });
  expect(retry).toMatchObject({ status: "advanced", batchId: "batch-1", eventCount: 5 });
  const names = avatarCalls().map((call) => call.name);
  expect(names.filter((name) => name === "next_interaction_batch")).toHaveLength(6);
  expect(avatarCalls().filter((call) => call.arguments.page_token === undefined && call.name === "next_interaction_batch")).toHaveLength(2);
  expect((await advanceReplay({ handoffPath, launch }))).toMatchObject({ batchId: "batch-2" });
});

it("advances one interaction per run, reads the pages of an empty batch, and then reports the end", async () => {
  const { handoffPath, launch, avatarCalls } = await setup();
  expect(await advanceReplay({ handoffPath, launch })).toMatchObject({ batchId: "batch-1" });
  const empty = await advanceReplay({ handoffPath, launch });
  expect(empty).toMatchObject({ status: "advanced", batchId: "batch-2", eventCount: 0,
    nextInteraction: { person: "sam" } });
  expect(avatarCalls().filter((call) => call.arguments.page_token === "batch-2:2")).toHaveLength(1);
  const final = await advanceReplay({ handoffPath, launch });
  expect(final).toEqual({ status: "ended", batchId: "batch-3", eventCount: 1, simulationTime: "2025-02-16T23:00:00+00:00" });
  expect(describeAdvance(final)).toMatch(/dataset ended, nothing left to replay/i);
  const callsBefore = avatarCalls().length;
  const again = await advanceReplay({ handoffPath, launch });
  expect(again).toEqual({ status: "ended", eventCount: 0, simulationTime: "2025-02-16T23:00:00+00:00" });
  expect(avatarCalls().slice(callsBefore).map((call) => call.name)).toEqual(["next_interaction_batch"]);
});

it("fails clearly without a handoff or for an unknown session", async () => {
  const { root, handoffPath, launch } = await setup();
  await expect(advanceReplay({ handoffPath: resolve(root, "absent.json"), launch }))
    .rejects.toThrow(/No Home Simulator session handoff.*absent\.json/);
  const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
  writeFileSync(handoffPath, JSON.stringify({ ...handoff, sessionId: "session-unknown" }));
  await expect(advanceReplay({ handoffPath, launch })).rejects.toThrow(/session-unknown.*pnpm home-simulator:session/);
});
