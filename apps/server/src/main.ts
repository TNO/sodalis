import { serve } from "@hono/node-server";
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
const app = createSpeechApp(
  new WhisperCppHttpEngine({ serverUrl: whisperServerUrl }),
  ttsEngine ? { ttsEngine } : {},
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
