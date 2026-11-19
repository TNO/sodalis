import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { HomeSimulatorSelection } from "../stack-config.js";
import { resolveBridgeHost } from "./bridge.js";

const repository = resolve(import.meta.dirname, "../..");

export interface StackLifecycle {
  readonly composeDown: () => void | Promise<void>;
  readonly composeUp: () => void | Promise<void>;
  readonly stopBridge: () => void | Promise<void>;
  readonly runSession: () => void | Promise<void>;
  readonly startBridge: () => void | Promise<void>;
}

export async function runStackLifecycle(
  operation: "up" | "down", enabled: boolean, runtime: StackLifecycle,
): Promise<void> {
  await runtime.stopBridge();
  await runtime.composeDown();
  if (operation === "up") {
    await runtime.composeUp();
    if (enabled) {
      await runtime.runSession();
      try {
        await runtime.startBridge();
      } catch (error) {
        await runtime.stopBridge();
        throw error;
      }
    }
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function isBridge(pid: number): boolean {
  const entry = resolve(repository, "scripts/home-simulator/bridge-main.ts");
  try {
    if (process.platform === "linux") {
      return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").includes(entry);
    }
    const command = process.platform === "win32"
      ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`], { encoding: "utf8" })
      : spawnSync("ps", ["-ww", "-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return command.status === 0 && command.stdout.includes(entry);
  } catch {
    // If the process cannot be identified, never risk signalling a reused PID.
    return false;
  }
}

export async function stopHomeSimulatorBridge(
  directory = resolve(repository, "logs/home-simulator"),
): Promise<void> {
  const recordPath = resolve(directory, "bridge.json");
  if (!existsSync(recordPath)) return;
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const pid = record?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error(`Invalid bridge PID in ${recordPath}.`);
  if (pid !== process.pid && isBridge(pid)) {
    try { process.kill(pid, "SIGTERM"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    const deadline = Date.now() + 5_000;
    while (isBridge(pid) && Date.now() < deadline) await sleep(50);
    if (isBridge(pid)) {
      // The detached group also contains the stdio child if graceful shutdown stalled.
      try { process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL"); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      const killDeadline = Date.now() + 2_000;
      while (isBridge(pid) && Date.now() < killDeadline) await sleep(50);
      if (isBridge(pid)) throw new Error(`Could not stop Home Simulator bridge PID ${pid}.`);
    }
  }
  rmSync(recordPath, { force: true });
}

export interface LauncherOptions {
  readonly selection: HomeSimulatorSelection;
  readonly directory?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export function createHomeSimulatorLauncher(options: LauncherOptions): Pick<StackLifecycle, "stopBridge" | "runSession" | "startBridge"> {
  const directory = options.directory ?? resolve(repository, "logs/home-simulator");
  const recordPath = resolve(directory, "bridge.json");
  const host = resolveBridgeHost(options.selection.bridgeHost);
  const port = options.selection.bridgePort;
  const environment = {
    ...process.env, ...options.environment,
    HOME_SIMULATOR_ROOT: options.selection.root,
    HOME_SIMULATOR_SCENARIO: options.selection.scenario,
    HOME_SIMULATOR_BRIDGE_HOST: host,
    HOME_SIMULATOR_BRIDGE_PORT: String(port),
    HOME_SIMULATOR_HANDOFF_PATH: resolve(directory, "session.json"),
  };
  const stopBridge = () => stopHomeSimulatorBridge(directory);
  return {
    stopBridge,
    runSession: () => {
      const result = spawnSync(process.execPath, ["--import", "tsx", resolve(repository, "scripts/home-simulator/session-main.ts")], {
        cwd: repository, env: environment, stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Home Simulator session script failed (exit ${result.status ?? result.signal}).`);
    },
    startBridge: async () => {
      if (existsSync(recordPath)) throw new Error(`Home Simulator bridge already recorded in ${recordPath}; stop it before starting.`);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const log = openSync(resolve(directory, "bridge.log"), "a", 0o600);
      const child = spawn(process.execPath, ["--import", "tsx", resolve(repository, "scripts/home-simulator/bridge-main.ts")], {
        cwd: repository, env: environment, detached: true, stdio: ["ignore", log, log, "ipc"],
      });
      closeSync(log);
      await new Promise<void>((ready, reject) => {
        child.once("spawn", ready);
        child.once("error", reject);
      });
      child.unref();
      const pid = child.pid!;
      try {
        writeFileSync(recordPath, `${JSON.stringify({ pid, host, port }, null, 2)}\n`, { mode: 0o600 });
        // Readiness must come from this child, not an unrelated listener on the port.
        await new Promise<void>((ready, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timer);
            child.off("exit", onExit);
            child.off("message", onMessage);
            if (error) reject(error); else ready();
          };
          const onExit = () => finish(new Error(`Home Simulator bridge exited before ready; see ${resolve(directory, "bridge.log")}.`));
          const onMessage = (message: unknown) => {
            if (message && typeof message === "object" && "ready" in message && message.ready === true) finish();
          };
          const timer = setTimeout(() => finish(new Error("Home Simulator bridge startup timed out.")), 20_000);
          child.once("exit", onExit);
          child.on("message", onMessage);
        });
        const url = `http://${host.includes(":") ? `[${host}]` : host}:${port}/health`;
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline && alive(pid)) {
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
            if (response.ok && (await response.json()).ok === true) return;
          } catch { /* The child may still be starting its MCP connection. */ }
          await sleep(100);
        }
        throw new Error(`Home Simulator bridge did not become healthy at ${url}; see ${resolve(directory, "bridge.log")}.`);
      } catch (error) {
        if (existsSync(recordPath)) await stopBridge();
        else if (alive(pid)) process.kill(pid, "SIGTERM");
        throw error;
      }
    },
  };
}
