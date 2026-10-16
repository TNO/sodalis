import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { countWordErrors } from "./stt-benchmark.js";

const CHUNK_MS = 200;
const AUDIO_EXTENSIONS = [".wav", ".m4a", ".flac", ".webm", ".ogg", ".mp3"];

function words(text: string): string[] {
  return text.toLocaleLowerCase("nl-NL").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** An update rewrites when it changes any word before the previous caption's last word. */
export function countCaptionRewrites(
  captions: readonly string[],
): { updates: number; rewrites: number } {
  let updates = 0;
  let rewrites = 0;
  let previous: string | undefined;
  for (const caption of captions) {
    if (caption === previous) continue;
    updates += 1;
    if (previous !== undefined) {
      const settled = words(previous).slice(0, -1);
      const next = words(caption);
      if (settled.some((word, index) => next[index] !== word)) rewrites += 1;
    }
    previous = caption;
  }
  return { updates, rewrites };
}

export function splitIntoChunks(audio: Uint8Array, count: number): Uint8Array[] {
  const size = Math.ceil(audio.byteLength / count);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < audio.byteLength; offset += size) {
    chunks.push(audio.subarray(offset, offset + size));
  }
  return chunks;
}

async function checked(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`STT returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function text(body: unknown): string {
  if (typeof body !== "object" || body === null || !("text" in body) ||
      typeof body.text !== "string") {
    throw new Error("STT returned an invalid transcript.");
  }
  return body.text;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function streamClip(origin: string, id: string, path: string) {
  // Same container and codec as Chromium's MediaRecorder.
  const webm = new Uint8Array(execFileSync("ffmpeg", [
    "-v", "error", "-i", path, "-ac", "1", "-ar", "48000",
    "-c:a", "libopus", "-b:a", "32k", "-f", "webm", "pipe:1",
  ], { maxBuffer: 64 * 1024 * 1024 }));
  const durationMs = execFileSync("ffmpeg", [
    "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1",
  ], { maxBuffer: 64 * 1024 * 1024 }).byteLength / 32;
  const chunks = splitIntoChunks(webm, Math.max(1, Math.ceil(durationMs / CHUNK_MS)));
  const sessionId = `live-${id}-${Date.now()}`;
  const endpoint = `${origin}/api/speech/stt/sessions/${sessionId}`;
  const created = await checked(await fetch(`${origin}/api/speech/stt/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, language: "nl-NL" }),
  })) as { partialIntervalMs?: number };
  const pollMs = created.partialIntervalMs ?? 1500;
  const startedAt = performance.now();
  const captions: { atMs: number; text: string }[] = [];
  let streaming = true;
  try {
    const poller = (async () => {
      while (streaming) {
        await sleep(pollMs);
        if (!streaming) break;
        const response = await fetch(`${endpoint}/partial`, { method: "POST" });
        if (response.status === 409 || response.status === 400) continue;
        const caption = text(await checked(response));
        if (caption) captions.push({ atMs: performance.now() - startedAt, text: caption });
      }
    })();
    // Surface poll failures after streaming instead of as an unhandled rejection.
    const pollResult = poller.then(() => undefined, (error: unknown) => error);
    for (const [index, chunk] of chunks.entries()) {
      await sleep(startedAt + index * CHUNK_MS - performance.now());
      await checked(await fetch(`${endpoint}/audio`, {
        method: "POST",
        headers: { "content-type": "audio/webm" },
        body: new Blob([Uint8Array.from(chunk)], { type: "audio/webm" }),
      }));
    }
    await sleep(startedAt + durationMs - performance.now());
    streaming = false;
    const pollError = await pollResult;
    if (pollError) throw pollError;
    const final = text(await checked(await fetch(`${endpoint}/finish`, { method: "POST" })));
    return {
      durationMs,
      firstCaptionMs: captions[0]?.atMs,
      finalLatencyMs: performance.now() - startedAt - durationMs,
      captions: captions.map((caption) => caption.text),
      final,
    };
  } catch (error) {
    streaming = false;
    await fetch(endpoint, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const [referencesArg, originArg] = process.argv.slice(2);
  if (!referencesArg || !originArg) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/stt-live-captions.ts <references.tsv> <local Sodalis origin>",
    );
  }
  const url = new URL(originArg);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:" ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("The live caption benchmark requires a local HTTP origin without credentials.");
  }
  const referencesPath = resolve(referencesArg);
  // Each line: clip ID (audio file name without extension), whitespace, reference text.
  const clips = readFileSync(referencesPath, "utf8").trim().split("\n").map((line) => {
    const [id, ...reference] = line.trim().split(/\s+/);
    const path = AUDIO_EXTENSIONS.map((extension) =>
      resolve(dirname(referencesPath), `${id}${extension}`)).find(existsSync);
    if (!path) throw new Error(`No audio file found for clip "${id}".`);
    return { id: id!, path, reference: reference.join(" ") };
  });
  let errors = 0;
  let referenceWords = 0;
  for (const clip of clips) {
    const result = await streamClip(url.origin, clip.id, clip.path);
    const score = countWordErrors(clip.reference, result.final);
    const rewrites = countCaptionRewrites(result.captions);
    errors += score.errors;
    referenceWords += score.words;
    console.log(JSON.stringify({
      id: clip.id,
      durationMs: Math.round(result.durationMs),
      firstCaptionMs: result.firstCaptionMs && Math.round(result.firstCaptionMs),
      finalLatencyMs: Math.round(result.finalLatencyMs),
      ...rewrites,
      wordErrors: score.errors,
      referenceWords: score.words,
      final: result.final,
    }));
  }
  console.log(JSON.stringify({ clips: clips.length, errors, referenceWords,
    wordErrorRate: errors / referenceWords }));
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
