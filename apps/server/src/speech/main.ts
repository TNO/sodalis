import { serveService } from "../serve.js";
import { createSpeechApp } from "./app.js";
import { createSpeechProviders } from "./providers.js";

const { stt, tts } = createSpeechProviders(process.env);
serveService(
  createSpeechApp(stt, { ttsEngine: tts }),
  "speech",
  3001,
);
