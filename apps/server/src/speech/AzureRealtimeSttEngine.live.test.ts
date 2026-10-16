import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AzureRealtimeSttEngine } from "./AzureRealtimeSttEngine.js";

const endpoint = process.env.AZURE_STT_ENDPOINT;
const key = process.env.AZURE_STT_KEY;
const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

// Opt-in: sends a one-second synthetic tone (no speech) to the configured Azure resource.
describe.skipIf(!endpoint || !key || !ffmpegAvailable)("Azure real-time STT (live)", () => {
  it("connects, streams audio, and completes a session", async () => {
    const engine = new AzureRealtimeSttEngine({ endpoint: endpoint!, key: key! });
    const session = engine.startSession({ language: "nl-NL", mimeType: "audio/webm" });
    session.write(new Uint8Array(readFileSync(new URL("./fixtures/tone-1s.webm", import.meta.url))));
    expect(typeof session.partialText()).toBe("string");
    const result = await session.finish();
    expect(typeof result.text).toBe("string");
  }, 30_000);
});
