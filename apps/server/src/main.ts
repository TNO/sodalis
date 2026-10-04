import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createAssistantApp } from "./assistant/app.js";
import { OpenAiCompatibleLlmProvider } from "./assistant/OpenAiCompatibleLlmProvider.js";
import { createSpeechApp } from "./speech/app.js";
import { PiperTtsEngine } from "./speech/PiperTtsEngine.js";
import { WhisperCppHttpEngine } from "./speech/WhisperCppHttpEngine.js";

const whisperServerUrl = process.env.WHISPER_CPP_URL;
if (!whisperServerUrl) {
  throw new Error("Set WHISPER_CPP_URL to the Whisper.cpp server URL.");
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const piperModelPath = process.env.PIPER_MODEL_PATH;
if (!piperModelPath) {
  console.warn("PIPER_MODEL_PATH is unset; server TTS is disabled.");
}
const ttsEngine = piperModelPath
  ? new PiperTtsEngine({
      executable: process.env.PIPER_EXECUTABLE ?? "piper",
      modelPath: piperModelPath,
    })
  : undefined;
const llmBaseUrl = process.env.LLM_BASE_URL;
const llmModel = process.env.LLM_MODEL;
if (Boolean(llmBaseUrl) !== Boolean(llmModel)) {
  throw new Error("Set both LLM_BASE_URL and LLM_MODEL to enable the assistant.");
}
if (!llmBaseUrl || !llmModel) {
  console.warn(
    "LLM_BASE_URL and LLM_MODEL are unset; assistant responses are disabled.",
  );
}
const llmProvider =
  llmBaseUrl && llmModel
    ? new OpenAiCompatibleLlmProvider({
        baseUrl: llmBaseUrl,
        model: llmModel,
        ...(process.env.LLM_API_KEY
          ? { apiKey: process.env.LLM_API_KEY }
          : {}),
      })
    : undefined;
const app = new Hono()
  .route(
    "/",
    createSpeechApp(
      new WhisperCppHttpEngine({ serverUrl: whisperServerUrl }),
      ttsEngine ? { ttsEngine } : {},
    ),
  )
  .route("/", createAssistantApp({ provider: llmProvider }));
serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST ?? "127.0.0.1",
    port,
  },
  (info) => {
    console.log(
      `Sodalis speech and assistant server listening on ${info.address}:${info.port}`,
    );
  },
);
