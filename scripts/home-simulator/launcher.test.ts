import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { createHomeSimulatorLauncher, runStackLifecycle } from "./launcher.js";

function runtime(fail?: string) {
  const events: string[] = [];
  const step = (name: string) => async () => {
    events.push(name);
    if (fail === name) throw new Error(`Failed ${name}`);
  };
  return { events, composeDown: step("compose-down"), composeUp: step("compose-up"),
    stopBridge: step("stop-bridge"), runSession: step("session"), startBridge: step("start-bridge") };
}

it("stops the recorded bridge before a fresh up and starts a fresh session only after compose succeeds", async () => {
  const run = runtime();
  await runStackLifecycle("up", true, run);
  expect(run.events).toEqual(["stop-bridge", "compose-down", "compose-up", "session", "start-bridge"]);
  run.events.length = 0;
  await runStackLifecycle("up", true, run);
  expect(run.events).toEqual(["stop-bridge", "compose-down", "compose-up", "session", "start-bridge"]);
  run.events.length = 0;
  await runStackLifecycle("down", true, run);
  await runStackLifecycle("down", true, run);
  expect(run.events).toEqual(["stop-bridge", "compose-down", "stop-bridge", "compose-down"]);
});

it("does not touch Home Simulator processes or files with the flag off", async () => {
  const run = runtime();
  await runStackLifecycle("up", false, run);
  await runStackLifecycle("down", false, run);
  expect(run.events).toEqual(["compose-down", "compose-up", "compose-down"]);
});

it("never opens a replay session when compose fails", async () => {
  const run = runtime("compose-up");
  await expect(runStackLifecycle("up", true, run)).rejects.toThrow("Failed compose-up");
  expect(run.events).toEqual(["stop-bridge", "compose-down", "compose-up"]);
});

it("cleans a partially started bridge when startup fails", async () => {
  const run = runtime("start-bridge");
  await expect(runStackLifecycle("up", true, run)).rejects.toThrow("Failed start-bridge");
  expect(run.events).toEqual(["stop-bridge", "compose-down", "compose-up", "session", "start-bridge", "stop-bridge"]);
});

it("starts a detached healthy bridge with a PID/port record and stops it and its avatar idempotently", async () => {
  const directory = mkdtempSync(resolve(".test-home-simulator-"));
  const python = resolve(directory, ".venv/bin/python");
  mkdirSync(resolve(directory, ".venv/bin"), { recursive: true });
  writeFileSync(python, `#!/usr/bin/env node\nimport(${JSON.stringify(pathToFileURL(resolve("scripts/home-simulator/fixtures/mcp-server.mjs")).href)});\n`, { mode: 0o700 });
  const server = createServer();
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port assigned");
  const port = address.port;
  await new Promise<void>((done) => server.close(() => done()));
  mkdirSync(resolve(directory, "applications/tool_service"), { recursive: true });
  const logs = resolve(directory, "logs");
  const launcher = createHomeSimulatorLauncher({
    directory: logs,
    selection: { root: directory, scenario: "avatar-support", bridgeHost: "127.0.0.1", bridgePort: port },
  });
  let avatarPid: number | undefined;
  try {
    await launcher.stopBridge();
    expect(existsSync(logs)).toBe(false);
    await launcher.runSession();
    await launcher.startBridge();
    const record = JSON.parse(readFileSync(resolve(logs, "bridge.json"), "utf8"));
    expect(record).toMatchObject({ port, host: "127.0.0.1" });
    expect(record.pid).toBeGreaterThan(0);
    const response = await fetch(`http://127.0.0.1:${port}/tools/get_context`, { method: "POST", body: '{"fixturePid":true}' });
    avatarPid = (await response.json()).pid;
    await launcher.stopBridge();
    await launcher.stopBridge();
    expect(existsSync(resolve(logs, "bridge.json"))).toBe(false);
    expect(() => process.kill(record.pid, 0)).toThrow();
    expect(avatarPid).toBeGreaterThan(0);
    expect(() => process.kill(avatarPid!, 0)).toThrow();
    await launcher.runSession();
    await launcher.startBridge();
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
  } finally {
    await launcher.stopBridge();
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);

it("does not mistake another process on the bridge port for its own healthy child", async () => {
  const directory = mkdtempSync(resolve(".test-home-simulator-"));
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port assigned");
  const launcher = createHomeSimulatorLauncher({
    directory: resolve(directory, "logs"),
    selection: { root: directory, scenario: "avatar-support", bridgeHost: "127.0.0.1", bridgePort: address.port },
  });
  try {
    await expect(launcher.startBridge()).rejects.toThrow(/Home Simulator bridge.*(healthy|ready|startup)/);
    expect(existsSync(resolve(directory, "logs/bridge.json"))).toBe(false);
  } finally {
    await launcher.stopBridge();
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  }
});
