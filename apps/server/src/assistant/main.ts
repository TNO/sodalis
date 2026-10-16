import { serveService } from "../serve.js";
import { createAssistantApp } from "./app.js";
import { createMemoryFromEnv } from "./memoryConfig.js";
import { createLlmProvider } from "./providers.js";

const provider = createLlmProvider(process.env);
const memory = await createMemoryFromEnv(process.env);
memory?.service.start();
serveService(
  createAssistantApp({
    provider,
    ...(memory ? { memory: memory.service, observationSources: memory.observationSources } : {}),
  }),
  "AI",
  3002,
);
