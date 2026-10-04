import { serve } from "@hono/node-server";
import { createSpeechApp } from "./speech/app.js";
import { WhisperCppHttpEngine } from "./speech/WhisperCppHttpEngine.js";

const whisperServerUrl = process.env.WHISPER_CPP_URL;
if (!whisperServerUrl) {
  throw new Error("Set WHISPER_CPP_URL to the Whisper.cpp server URL.");
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const app = createSpeechApp(
  new WhisperCppHttpEngine({ serverUrl: whisperServerUrl }),
);
serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST ?? "127.0.0.1",
    port,
  },
  (info) => {
    console.log(`Sodalis speech server listening on ${info.address}:${info.port}`);
  },
);
