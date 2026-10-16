import { spawn } from "node:child_process";
import type { PcmTranscoderFactory } from "./AzureRealtimeSttEngine.js";

const INPUT_FORMATS: Readonly<Record<string, string>> = {
  "audio/webm": "matroska",
  "audio/ogg": "ogg",
};

/** Converts a growing browser recording to 16 kHz mono PCM16 as it arrives. */
export const createFfmpegPcmTranscoder: PcmTranscoderFactory = ({
  mimeType,
  onPcm,
  onError,
}) => {
  const format = INPUT_FORMATS[mimeType];
  const child = spawn("ffmpeg", [
    "-hide_banner", "-nostdin", "-loglevel", "error",
    // Decode immediately instead of probing seconds of input first.
    "-fflags", "nobuffer", "-probesize", "4096", "-analyzeduration", "0",
    ...(format ? ["-f", format] : []),
    "-i", "pipe:0",
    "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-flush_packets", "1",
    "pipe:1",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let killed = false;
  let reported = false;
  let stderr = "";
  const report = (error: Error) => {
    if (killed || reported) return;
    reported = true;
    onError(error);
  };
  child.stdout.on("data", (data: Buffer) => {
    if (!killed) onPcm(new Uint8Array(data));
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr = (stderr + data.toString("utf8")).slice(-2000);
  });
  child.stdin.on("error", () => {});
  const exited = new Promise<void>((resolve) => {
    child.on("error", (error) => {
      report(new Error(`FFmpeg could not start: ${error.message}`));
      resolve();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        report(new Error(
          `FFmpeg could not decode the audio: ${stderr.trim() || `exit code ${code}`}`,
        ));
      }
      resolve();
    });
  });
  return {
    write(chunk) {
      if (!killed && child.stdin.writable) child.stdin.write(chunk);
    },
    async end() {
      if (!killed) child.stdin.end();
      await exited;
    },
    kill() {
      if (killed) return;
      killed = true;
      child.kill("SIGKILL");
    },
  };
};
