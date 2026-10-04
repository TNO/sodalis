import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { resolveStack } from "./stack-config.js";

const root = resolve(import.meta.dirname, "..");
const settings = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
const selection = resolveStack(settings);
const origin = `http://127.0.0.1:${selection.environment.SODALIS_PORT}`;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response;
}

async function ready(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await request("/healthz");
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
  throw new Error(`Gateway at ${origin} was not ready after 30 seconds.`);
}

async function main(): Promise<void> {
await ready();
if (settings.HOME_ADMIN_UI === "1") {
  let adminReady = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      adminReady = (await (await request("/")).text()).includes("Home Assistant");
      if (adminReady) break;
    } catch {
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
  if (!adminReady) throw new Error("Gateway did not serve the Home Assistant Core admin UI.");
} else {
  const desktop = await request("/");
  if (!(await desktop.text()).includes("Sodalis")) {
    throw new Error("Gateway did not serve the Sodalis desktop.");
  }
}
const turn = await request("/api/assistant/turns", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId: "smoke-session", turnId: "smoke-turn",
    messages: [{ role: "user", content: "Say hello." }],
  }),
});
if (!(await turn.text()).includes('"sessionId":"smoke-session"')) {
  throw new Error("AI service did not stream a Sodalis turn.");
}

const sttSession = await request("/api/speech/stt/sessions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sessionId: "smoke-stt", language: "nl-NL" }),
});
if ((await sttSession.json() as { sessionId?: string }).sessionId !== "smoke-stt") {
  throw new Error("Speech service did not create an STT session.");
}
const audio = new Uint8Array(44 + 32_000 * 2);
const header = new DataView(audio.buffer);
const label = (offset: number, text: string) => {
  for (let index = 0; index < text.length; index += 1) audio[offset + index] = text.charCodeAt(index);
};
label(0, "RIFF"); header.setUint32(4, audio.length - 8, true);
label(8, "WAVE"); label(12, "fmt "); header.setUint32(16, 16, true);
header.setUint16(20, 1, true); header.setUint16(22, 1, true);
header.setUint32(24, 16000, true); header.setUint32(28, 32000, true);
header.setUint16(32, 2, true); header.setUint16(34, 16, true);
label(36, "data"); header.setUint32(40, audio.length - 44, true);
await request("/api/speech/stt/sessions/smoke-stt/audio", {
  method: "POST", headers: { "content-type": "audio/wav" }, body: audio,
});
const transcript: unknown = await (await request(
  "/api/speech/stt/sessions/smoke-stt/finish", { method: "POST" },
)).json();
if (typeof transcript !== "object" || transcript === null ||
    !("text" in transcript) || typeof transcript.text !== "string") {
  throw new Error("Speech service did not return a transcript.");
}
const pcm = await request("/api/speech/tts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId: "smoke-session", speechId: "smoke-speech",
    text: "Hallo", language: "nl-NL",
  }),
});
if (!pcm.headers.get("content-type")?.startsWith("audio/pcm") ||
    (await pcm.arrayBuffer()).byteLength === 0) {
  throw new Error("Speech service did not stream PCM audio.");
}

if (settings.HOME_ADMIN_UI !== "1") {
  const entities: unknown = await (await request("/api/home/entities?q=bed")).json();
  if (!Array.isArray(entities) ||
      (settings.HOME_PROVIDER === "simulator" && !entities.some((entity: unknown) =>
        typeof entity === "object" && entity !== null &&
        "entityId" in entity && entity.entityId === "light.bed_light"))) {
    throw new Error("Home API did not return the selected provider's semantic entities.");
  }
}
console.log("Gateway, selected UI, AI stream, STT transcript, TTS stream, and selected Home route passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
