import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preprocessVoiceReference } from "./preprocessVoiceReference.js";

describe("Pocket voice reference preprocessing", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("runs the declared filter chain and writes mono 24 kHz PCM WAV", async () => {
    directory = await mkdtemp(join(tmpdir(), "sodalis-voice-reference-"));
    const input = join(directory, "source.wav");
    const output = join(directory, "prepared.wav");
    await writeFile(input, new Uint8Array([1, 2, 3]));
    const runFfmpeg = vi.fn(async () => undefined);

    await preprocessVoiceReference(input, output, runFfmpeg);

    expect(runFfmpeg).toHaveBeenCalledWith([
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-i",
      input,
      "-af",
      "highpass=f=80,lowpass=f=11000,adeclick,loudnorm=I=-20:TP=-2:LRA=7",
      "-ac",
      "1",
      "-ar",
      "24000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      output,
    ]);
  });

  it("rejects missing, empty, same-path, and non-WAV inputs before invoking FFmpeg", async () => {
    directory = await mkdtemp(join(tmpdir(), "sodalis-voice-reference-"));
    const input = join(directory, "source.wav");
    await writeFile(input, new Uint8Array());
    const runFfmpeg = vi.fn(async () => undefined);

    await expect(
      preprocessVoiceReference(join(directory, "missing.wav"), join(directory, "out.wav"), runFfmpeg),
    ).rejects.toThrow("does not exist");
    await expect(
      preprocessVoiceReference(input, join(directory, "out.wav"), runFfmpeg),
    ).rejects.toThrow("empty");
    await expect(
      preprocessVoiceReference(input, input, runFfmpeg),
    ).rejects.toThrow("must differ");
    await writeFile(input, new Uint8Array([1]));
    await expect(
      preprocessVoiceReference(input, join(directory, "out.flac"), runFfmpeg),
    ).rejects.toThrow(".wav");
    expect(runFfmpeg).not.toHaveBeenCalled();
  });

  it("surfaces FFmpeg failures with actionable context", async () => {
    directory = await mkdtemp(join(tmpdir(), "sodalis-voice-reference-"));
    const input = join(directory, "source.wav");
    await writeFile(input, new Uint8Array([1]));
    const runFfmpeg = vi.fn(async () => {
      throw new Error("adeclick filter unavailable");
    });

    await expect(
      preprocessVoiceReference(input, join(directory, "out.wav"), runFfmpeg),
    ).rejects.toThrow("ffmpeg failed: adeclick filter unavailable");
  });
});
