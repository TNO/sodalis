import { serveService } from "../serve.js";
import { createAssistantApp } from "./app.js";
import { createLlmProvider } from "./providers.js";

const provider = createLlmProvider(process.env);
serveService(createAssistantApp({ provider }), "AI", 3002);
