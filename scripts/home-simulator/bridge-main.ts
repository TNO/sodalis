import { startHomeSimulatorBridge } from "./bridge.js";
import { readSessionHandoff } from "./session.js";
import { homeSimulatorEnvironment } from "./settings.js";

async function main(): Promise<void> {
  const settings = homeSimulatorEnvironment();
  const handoff = readSessionHandoff(settings.HOME_SIMULATOR_HANDOFF_PATH?.trim() || undefined);
  const port = Number(settings.HOME_SIMULATOR_BRIDGE_PORT?.trim() || "8095");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("HOME_SIMULATOR_BRIDGE_PORT must be 1..65535.");
  const bridge = await startHomeSimulatorBridge({ handoff, host: settings.HOME_SIMULATOR_BRIDGE_HOST, port });
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    void bridge.close().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  console.log(`Home Simulator bridge listening at ${bridge.url}.`);
  if (process.send && process.connected) {
    process.send({ ready: true }, () => { if (process.connected) process.disconnect?.(); });
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
