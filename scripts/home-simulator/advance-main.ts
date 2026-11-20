import { advanceReplay, describeAdvance } from "./advance.js";
import { homeSimulatorEnvironment } from "./settings.js";

async function main(): Promise<void> {
  const settings = homeSimulatorEnvironment();
  console.log(describeAdvance(await advanceReplay({ handoffPath: settings.HOME_SIMULATOR_HANDOFF_PATH?.trim() || undefined })));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
