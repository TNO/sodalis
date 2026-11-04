import { serveService } from "../serve.js";
import { createAssistantApp } from "./app.js";
import { createCompanionHarnessFromEnv } from "./harness/config.js";
import { createMemoryFromEnv } from "./memoryConfig.js";
import { createLlmProvider } from "./providers.js";

const provider = createLlmProvider(process.env);
const memory = await createMemoryFromEnv(process.env);
memory?.service.start();
const workflows = await createCompanionHarnessFromEnv(process.env);
serveService(
  createAssistantApp({
    provider,
    ...(memory ? { memory: memory.service, observationSources: memory.observationSources } : {}),
    ...(workflows ? { workflows } : {}),
  }),
  "AI",
  3002,
);
