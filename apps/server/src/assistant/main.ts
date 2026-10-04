import { serveService } from "../serve.js";
import { createAssistantApp } from "./app.js";
import { OpenAiCompatibleLlmProvider } from "./OpenAiCompatibleLlmProvider.js";

const baseUrl = process.env.LLM_BASE_URL;
const model = process.env.LLM_MODEL;
if (Boolean(baseUrl) !== Boolean(model)) {
  throw new Error("Set both LLM_BASE_URL and LLM_MODEL to enable the assistant.");
}
if (!baseUrl) console.warn("LLM_BASE_URL and LLM_MODEL are unset; assistant responses are disabled.");
const provider = baseUrl && model
  ? new OpenAiCompatibleLlmProvider({
      baseUrl,
      model,
      ...(process.env.LLM_API_KEY ? { apiKey: process.env.LLM_API_KEY } : {}),
    })
  : undefined;
serveService(createAssistantApp({ provider }), "AI", 3002);
