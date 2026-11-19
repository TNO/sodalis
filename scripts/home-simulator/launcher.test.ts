import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createHomeSimulatorLauncher, runStackLifecycle, stopHomeSimulatorBridge } from "./launcher.js";

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

it("only stops a previously recorded bridge with the flag off", async () => {
  const run = runtime();
  await runStackLifecycle("up", false, run);
  await runStackLifecycle("down", false, run);
  expect(run.events).toEqual(["stop-bridge", "compose-down", "compose-up", "stop-bridge", "compose-down"]);
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

it.each(["up", "down"] as const)("stops a previously recorded bridge and its avatar on %s with the flag off, without starting a replay", async (operation) => {
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
    const run = runtime();
    await runStackLifecycle(operation, false, { ...run, stopBridge: launcher.stopBridge });
    expect(run.events).toEqual(operation === "up" ? ["compose-down", "compose-up"] : ["compose-down"]);
    expect(existsSync(resolve(logs, "bridge.json"))).toBe(false);
    expect(() => process.kill(record.pid, 0)).toThrow();
    expect(avatarPid).toBeGreaterThan(0);
    expect(() => process.kill(avatarPid!, 0)).toThrow();
    await launcher.stopBridge();
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

it("removes a stale bridge record without killing an unrelated process that reused its PID", async () => {
  const directory = mkdtempSync(resolve(".test-home-simulator-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1_000)"], { stdio: "ignore" });
  const launcher = createHomeSimulatorLauncher({
    directory,
    selection: { root: directory, scenario: "avatar-support", bridgeHost: "127.0.0.1", bridgePort: 8095 },
  });
  try {
    await once(child, "spawn");
    writeFileSync(resolve(directory, "bridge.json"), JSON.stringify({ pid: child.pid, host: "127.0.0.1", port: 8095 }));
    await launcher.stopBridge();
    expect(existsSync(resolve(directory, "bridge.json"))).toBe(false);
    expect(() => process.kill(child.pid!, 0)).not.toThrow();
    await launcher.stopBridge();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

it("discards a stale record pointing at the launcher itself without requiring simulator settings", async () => {
  const directory = mkdtempSync(resolve(".test-home-simulator-"));
  try {
    writeFileSync(resolve(directory, "bridge.json"), JSON.stringify({ pid: process.pid }));
    await stopHomeSimulatorBridge(directory);
    expect(existsSync(resolve(directory, "bridge.json"))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each([
  { operation: "down", provider: "simulator", recorded: true },
  { operation: "up", provider: "external-api", recorded: true },
  { operation: "down", provider: "external-api", recorded: true },
  { operation: "down", provider: "external-api", recorded: false },
])("stack:$operation cleans only its recorded bridge (provider=$provider, recorded=$recorded), without requiring simulator settings", async ({ operation, provider, recorded }) => {
  const directory = mkdtempSync(resolve(".test-home-simulator-"));
  const scripts = resolve(directory, "scripts");
  const bridgeDirectory = resolve(scripts, "home-simulator");
  const logs = resolve(directory, "logs/home-simulator");
  const bin = resolve(directory, "bin");
  for (const path of [bridgeDirectory, bin]) mkdirSync(path, { recursive: true });
  if (recorded) {
    mkdirSync(logs, { recursive: true });
    writeFileSync(resolve(logs, "session.json"), "previous handoff");
    writeFileSync(resolve(logs, "bridge.log"), "previous log");
  }
  copyFileSync(resolve("scripts/dev-stack.ts"), resolve(scripts, "dev-stack.ts"));
  copyFileSync(resolve("scripts/home-simulator/launcher.ts"), resolve(bridgeDirectory, "launcher.ts"));
  symlinkSync(resolve("scripts/stack-config.ts"), resolve(scripts, "stack-config.ts"));
  symlinkSync(resolve("scripts/home-simulator/bridge.ts"), resolve(bridgeDirectory, "bridge.ts"));
  for (const path of ["apps", "node_modules"]) symlinkSync(resolve(path), resolve(directory, path), "dir");
  writeFileSync(resolve(directory, ".env"), `STT_PROVIDER=mock\nTTS_PROVIDER=mock\nLLM_PROVIDER=mock\nHOME_PROVIDER=${provider}\nHOME_SIMULATOR_ROOT=\n${provider === "simulator" ? "HOME_ADMIN_UI=1" : "HOME_API_URL=http://home.test"}\n`);
  const calls = resolve(directory, "compose-calls.jsonl");
  const docker = `#!${process.execPath}\nrequire("node:fs").appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`;
  for (const command of ["docker", "docker-compose", "podman"]) writeFileSync(resolve(bin, command), docker, { mode: 0o700 });
  const entry = resolve(bridgeDirectory, "bridge-main.ts");
  writeFileSync(entry, "setInterval(() => {}, 1_000);\n");
  const child = recorded ? spawn(process.execPath, [entry], { stdio: "ignore" }) : undefined;
  try {
    if (child) {
      await once(child, "spawn");
      writeFileSync(resolve(logs, "bridge.json"), JSON.stringify({ pid: child.pid, host: "127.0.0.1", port: 8095 }));
    }
    await promisify(execFile)(process.execPath, ["--import", "tsx", resolve(scripts, "dev-stack.ts"), operation], {
      cwd: directory, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` }, timeout: 10_000,
    });
    expect(existsSync(resolve(logs, "bridge.json"))).toBe(false);
    if (child) expect(() => process.kill(child.pid!, 0)).toThrow();
    if (recorded) {
      expect(readdirSync(logs).sort()).toEqual(["bridge.log", "session.json"]);
      expect(readFileSync(resolve(logs, "session.json"), "utf8")).toBe("previous handoff");
      expect(readFileSync(resolve(logs, "bridge.log"), "utf8")).toBe("previous log");
    } else {
      expect(existsSync(logs)).toBe(false);
    }
    const commands: string[][] = readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(commands.some((args) => args.includes("down"))).toBe(true);
    expect(commands.some((args) => args.includes("up"))).toBe(operation === "up");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);
