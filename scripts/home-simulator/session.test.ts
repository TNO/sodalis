import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createReplaySession, readSessionHandoff } from "./session.js";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup(state: object = {}) {
  const root = mkdtempSync(resolve(".test-home-simulator-"));
  directories.push(root);
  writeFileSync(resolve(root, "fixture.json"), JSON.stringify(state));
  return {
    root, stateDir: root, handoffPath: resolve(root, "session.json"), pollIntervalMs: 1,
    launch: { command: process.execPath, args: [resolve("scripts/home-simulator/fixtures/mcp-server.mjs")] },
  };
}

it("reuses the deterministic matching dataset and hands off a fresh replay session each launch", async () => {
  const options = setup({ datasets: [
    { dataset_id: "dataset-z", metadata: { plan: "avatar-support" } },
    { dataset_id: "dataset-other", metadata: { plan: "other" } },
    { dataset_id: "dataset-a", metadata: { plan: "avatar-support" } },
  ], jobStatus: "failed" });
  const first = await createReplaySession(options);
  expect(first).toMatchObject({ root: options.root, stateDir: options.stateDir,
    datasetId: "dataset-a", scenario: "avatar-support" });
  expect(readSessionHandoff(options.handoffPath)).toEqual(first);
  expect(JSON.parse(readFileSync(options.handoffPath, "utf8"))).toEqual(first);
  const second = await createReplaySession(options);
  expect(second.sessionId).not.toBe(first.sessionId);
  expect(second.datasetId).toBe("dataset-a");
  expect(readSessionHandoff(options.handoffPath)).toEqual(second);
});

it("generates and registers an absent scenario once, waits for completion, then reuses it", async () => {
  const options = { ...setup(), scenario: "another-home" };
  const first = await createReplaySession(options);
  expect(first).toMatchObject({ datasetId: "dataset-another-home", scenario: "another-home" });
  const statePath = resolve(options.stateDir, "fixture.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  // A second generation would fail, so success requires reusing the registered dataset.
  writeFileSync(statePath, JSON.stringify({ ...state, jobStatus: "failed" }));
  const second = await createReplaySession(options);
  expect(second.datasetId).toBe(first.datasetId);
  expect(second.sessionId).not.toBe(first.sessionId);
});

for (const status of ["failed", "interrupted", "cancelled"]) {
  it(`fails clearly on a ${status} generation and leaves the existing handoff untouched`, async () => {
    const options = setup({ jobStatus: status });
    writeFileSync(options.handoffPath, "previous session");
    await expect(createReplaySession(options)).rejects.toThrow(new RegExp(`${status}.*Fixture generation stopped`));
    expect(readFileSync(options.handoffPath, "utf8")).toBe("previous session");
  });
}
