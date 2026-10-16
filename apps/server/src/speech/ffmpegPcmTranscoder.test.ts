import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFfmpegPcmTranscoder } from "./ffmpegPcmTranscoder.js";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;
const toneWebm = new Uint8Array(
  readFileSync(new URL("./fixtures/tone-1s.webm", import.meta.url)),
);

describe.skipIf(!ffmpegAvailable)("FFmpeg PCM transcoder", () => {
  it("converts streamed browser WebM/Opus to 16 kHz mono PCM16, starting before the input ends", async () => {
    const pcm: Uint8Array[] = [];
    const errors: Error[] = [];
    const transcoder = createFfmpegPcmTranscoder({
      mimeType: "audio/webm",
      onPcm: (chunk) => pcm.push(chunk),
      onError: (error) => errors.push(error),
    });
    const half = Math.floor(toneWebm.byteLength / 2);
    transcoder.write(toneWebm.subarray(0, half));
    transcoder.write(toneWebm.subarray(half));
    await expect.poll(() => pcm.length, { timeout: 3000 }).toBeGreaterThan(0);

    await transcoder.end();
    const bytes = pcm.reduce((total, chunk) => total + chunk.byteLength, 0);
    expect(bytes).toBeGreaterThan(0.95 * 32000);
    expect(bytes).toBeLessThan(1.05 * 32000);
    expect(errors).toEqual([]);
  });

  it("reports undecodable audio and can be killed without further errors", async () => {
    const errors: Error[] = [];
    const broken = createFfmpegPcmTranscoder({
      mimeType: "audio/webm",
      onPcm: () => {},
      onError: (error) => errors.push(error),
    });
    broken.write(new TextEncoder().encode("not audio"));
    await broken.end();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/^FFmpeg could not decode the audio/);

    const killedErrors: Error[] = [];
    const killed = createFfmpegPcmTranscoder({
      mimeType: "audio/webm",
      onPcm: () => {},
      onError: (error) => killedErrors.push(error),
    });
    killed.write(toneWebm.subarray(0, 100));
    killed.kill();
    killed.kill();
    killed.write(toneWebm.subarray(100));
    await killed.end();
    expect(killedErrors).toEqual([]);
  });
});
