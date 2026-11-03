import { readFile } from "node:fs/promises";
import { serveService } from "../serve.js";
import { createPocketTtsHostService } from "./PocketTtsHostService.js";

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`Set ${name} to start the Pocket TTS host service.`);
  }
  return value;
}

const referenceWav = new Uint8Array(
  await readFile(
    required(
      process.env.POCKET_TTS_REFERENCE_WAV,
      "POCKET_TTS_REFERENCE_WAV",
    ),
  ),
);
const app = await createPocketTtsHostService({
  nativeServerUrl: required(
    process.env.POCKET_TTS_NATIVE_URL,
    "POCKET_TTS_NATIVE_URL",
  ),
  apiKey: required(process.env.POCKET_TTS_API_KEY, "POCKET_TTS_API_KEY"),
  voice: required(process.env.POCKET_TTS_VOICE, "POCKET_TTS_VOICE"),
  referenceWav,
});
serveService(app, "Pocket TTS host", 8094);
