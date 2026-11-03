import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

export type FfmpegRunner = (args: readonly string[]) => Promise<void>;

const FILTER_CHAIN =
  "highpass=f=80,lowpass=f=11000,adeclick,loudnorm=I=-20:TP=-2:LRA=7";

function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
    return error.stderr.trim();
  }
  return error.message;
}

function runFfmpeg(args: readonly string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    execFile(
      "ffmpeg",
      [...args],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          rejectRun(new Error(stderr.trim() || error.message, { cause: error }));
          return;
        }
        resolveRun();
      },
    );
  });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export async function preprocessVoiceReference(
  inputPath: string,
  outputPath: string,
  run: FfmpegRunner = runFfmpeg,
): Promise<void> {
  if (!inputPath.trim() || !outputPath.trim()) {
    throw new Error("Input and output paths are required.");
  }
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) {
    throw new Error("Input and output paths must differ.");
  }
  if (extname(output).toLowerCase() !== ".wav") {
    throw new Error("Output path must use the .wav extension.");
  }

  let inputStats;
  try {
    inputStats = await stat(input);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`Input audio file does not exist: ${input}`, { cause: error });
    }
    throw new Error(`Unable to inspect input audio file: ${errorDetail(error)}`, {
      cause: error,
    });
  }
  if (!inputStats.isFile()) {
    throw new Error(`Input audio path is not a file: ${input}`);
  }
  if (inputStats.size === 0) {
    throw new Error(`Input audio file is empty: ${input}`);
  }

  try {
    await run([
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-i",
      input,
      "-af",
      FILTER_CHAIN,
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
  } catch (error) {
    throw new Error(`ffmpeg failed: ${errorDetail(error)}`, { cause: error });
  }
}
