import { serveService } from "../serve.js";
import { createSpeechApp } from "./app.js";
import { createSpeechProviders } from "./providers.js";

function numericSetting(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return parsed;
}

const { stt, tts } = createSpeechProviders(process.env);
serveService(
  createSpeechApp(stt, {
    ttsEngine: tts,
    maxTtsChunkCharacters: numericSetting(
      "TTS_CHUNK_MAX_CHARACTERS",
      process.env.TTS_CHUNK_MAX_CHARACTERS,
    ),
    ttsChunkPauseMs: numericSetting(
      "TTS_CHUNK_PAUSE_MS",
      process.env.TTS_CHUNK_PAUSE_MS,
    ),
  }),
  "speech",
  3001,
);
