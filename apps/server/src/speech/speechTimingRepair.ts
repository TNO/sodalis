import { spawn } from "node:child_process";
import type { SpeechWordTimestamp } from "./speechWordAlignment.js";

export type SpeechOnsetDetection =
  | { readonly status: "no-silence"; readonly onsetSeconds: 0 }
  | { readonly status: "leading-silence"; readonly onsetSeconds: number }
  | { readonly status: "all-silence" };

export type FfmpegSilenceDetector = (
  audio: Uint8Array,
  mimeType: string,
  signal: AbortSignal,
) => Promise<string>;

export type SpeechOnsetDetector = (
  audio: Uint8Array,
  mimeType: string,
  signal: AbortSignal,
) => Promise<SpeechOnsetDetection>;

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function runFfmpegSilencedetect(
  audio: Uint8Array,
  _mimeType: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-nostdin",
        "-i",
        "pipe:0",
        "-af",
        "silencedetect=noise=-40dB:d=0.01",
        "-f",
        "null",
        "-",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (error) rejectRun(error);
      else resolveRun(stderr);
    };
    const abort = () => {
      child.kill("SIGTERM");
      finish(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Speech onset detection was cancelled.", "AbortError"),
      );
    };
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-64 * 1024);
    });
    child.stdin.on("error", () => {});
    child.once("error", (error) => {
      finish(new Error(`ffmpeg could not start: ${error.message}`, { cause: error }));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        finish(
          new Error(
            `ffmpeg exited with ${code ?? "no status"}: ${stderr.trim() || "no diagnostic output"}`,
          ),
        );
        return;
      }
      finish();
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    child.stdin.end(Buffer.from(audio));
  });
}

export function parseSilenceDetectOutput(output: string): SpeechOnsetDetection {
  const startMatch = /silence_start:\s*([^\s|]+)/u.exec(output);
  if (!startMatch) return { status: "no-silence", onsetSeconds: 0 };
  const silenceStart = Number(startMatch[1]);
  if (!Number.isFinite(silenceStart) || silenceStart < 0) {
    throw new Error("FFmpeg silence detection output could not parse silence_start.");
  }
  if (silenceStart > 0.02) {
    return { status: "no-silence", onsetSeconds: 0 };
  }
  const endMatch = /silence_end:\s*([^\s|]+)/u.exec(output);
  if (!endMatch) return { status: "all-silence" };
  const onsetSeconds = Number(endMatch[1]);
  if (!Number.isFinite(onsetSeconds) || onsetSeconds <= silenceStart) {
    throw new Error("FFmpeg silence detection output could not parse silence_end.");
  }
  return { status: "leading-silence", onsetSeconds };
}

export async function detectSpeechOnset(
  audio: Uint8Array,
  mimeType: string,
  signal: AbortSignal,
  detect: FfmpegSilenceDetector = runFfmpegSilencedetect,
): Promise<SpeechOnsetDetection> {
  signal.throwIfAborted();
  if (!audio.byteLength) throw new Error("Audio is required for onset detection.");
  try {
    return parseSilenceDetectOutput(await detect(audio, mimeType, signal));
  } catch (error) {
    if (signal.aborted) {
      throw signal.reason ??
        new DOMException("Speech onset detection was cancelled.", "AbortError");
    }
    throw new Error(`FFmpeg silence detection failed: ${errorDetail(error)}`, {
      cause: error,
    });
  }
}

export function shiftWordTimestamps(
  wordTimestamps: readonly SpeechWordTimestamp[],
  onsetSeconds: number,
): SpeechWordTimestamp[] {
  if (!Number.isFinite(onsetSeconds) || onsetSeconds < 0) {
    throw new RangeError("Speech onset must be finite and non-negative.");
  }
  return wordTimestamps.map((timestamp) => {
    if (
      !Number.isFinite(timestamp.start) ||
      !Number.isFinite(timestamp.end) ||
      timestamp.start < 0 ||
      timestamp.end < timestamp.start
    ) {
      throw new RangeError("Word timestamps must have valid start and end times.");
    }
    const start = roundSeconds(Math.max(0, timestamp.start - onsetSeconds));
    return {
      word: timestamp.word,
      start,
      end: roundSeconds(Math.max(start, timestamp.end - onsetSeconds)),
    };
  });
}
