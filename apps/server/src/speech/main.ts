import { serveService } from "../serve.js";
import { createSpeechApp } from "./app.js";
import { PiperTtsEngine } from "./PiperTtsEngine.js";
import { WhisperCppHttpEngine } from "./WhisperCppHttpEngine.js";

const serverUrl = process.env.WHISPER_CPP_URL;
if (!serverUrl) throw new Error("Set WHISPER_CPP_URL to the Whisper.cpp server URL.");

const modelPath = process.env.PIPER_MODEL_PATH;
if (!modelPath) console.warn("PIPER_MODEL_PATH is unset; server TTS is disabled.");
const ttsEngine = modelPath
  ? new PiperTtsEngine({
      executable: process.env.PIPER_EXECUTABLE ?? "piper",
      modelPath,
    })
  : undefined;
serveService(
  createSpeechApp(new WhisperCppHttpEngine({ serverUrl }), ttsEngine ? { ttsEngine } : {}),
  "speech",
  3001,
);
