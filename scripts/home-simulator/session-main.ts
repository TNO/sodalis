import { validateHomeSimulatorCheckout } from "../stack-config.js";
import { createReplaySession } from "./session.js";
import { homeSimulatorEnvironment } from "./settings.js";

async function main(): Promise<void> {
  const settings = homeSimulatorEnvironment();
  const root = settings.HOME_SIMULATOR_ROOT?.trim();
  if (!root) throw new Error("Set HOME_SIMULATOR_ROOT in .env to your prepared home_simulator checkout.");
  validateHomeSimulatorCheckout(root);
  const session = await createReplaySession({ root,
    scenario: settings.HOME_SIMULATOR_SCENARIO?.trim() || "avatar-support",
    handoffPath: settings.HOME_SIMULATOR_HANDOFF_PATH?.trim() || undefined,
  });
  console.log(`Home Simulator replay session ${session.sessionId} (dataset ${session.datasetId}).`);
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
