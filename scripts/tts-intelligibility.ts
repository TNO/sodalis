import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { countWordErrors } from "./stt-benchmark.js";

export interface ClipScore {
  readonly reference: string;
  readonly transcript: string;
  readonly errors: number;
  readonly words: number;
}

export interface Intelligibility {
  readonly results: Record<string, ClipScore>;
}

interface Metrics {
  readonly results: Record<string, { readonly text: string }>;
}

export function scoreClip(reference: string, transcript: string): ClipScore {
  return { reference, transcript, ...countWordErrors(reference, transcript) };
}

/** Clips without a score for their current reference text, in key order. */
export function pendingClips(
  metrics: Metrics,
  existing: Intelligibility,
): string[] {
  return Object.keys(metrics.results).sort().filter((key) =>
    existing.results[key]?.reference !== metrics.results[key]!.text);
}

export function summarize(scores: Intelligibility): {
  clips: number; errors: number; words: number; wordErrorRate: number | null;
} {
  const values = Object.values(scores.results);
  const errors = values.reduce((sum, score) => sum + score.errors, 0);
  const words = values.reduce((sum, score) => sum + score.words, 0);
  return { clips: values.length, errors, words,
    wordErrorRate: words ? errors / words : null };
}

export function localOrigin(value: string): string {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.protocol !== "http:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("TTS intelligibility scoring requires a local HTTP origin without credentials.");
  }
  return url.origin;
}

async function checkedResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(`STT returned HTTP ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function transcribe(
  audio: Buffer,
  sessionId: string,
  origin: string,
): Promise<string> {
  const endpoint = `${origin}/api/speech/stt/sessions/${sessionId}`;
  await checkedResponse(await fetch(`${origin}/api/speech/stt/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, language: "nl-NL" }),
    signal: AbortSignal.timeout(180_000),
  }));
  try {
    await checkedResponse(await fetch(`${endpoint}/audio`, {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: new Blob([Uint8Array.from(audio)], { type: "audio/wav" }),
      signal: AbortSignal.timeout(180_000),
    }));
    const response = await checkedResponse(await fetch(`${endpoint}/finish`, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
    }));
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null ||
        !("text" in result) || typeof result.text !== "string") {
      throw new Error(`STT returned an invalid transcript for ${sessionId}.`);
    }
    return result.text;
  } catch (error) {
    const cleanup = await fetch(endpoint, { method: "DELETE" });
    if (!cleanup.ok && cleanup.status !== 404) {
      console.error(`Unable to clean up ${sessionId}: HTTP ${cleanup.status}`);
    }
    throw error;
  }
}

async function scoreRun(directory: string, origin: string): Promise<void> {
  const name = directory.split(/[\\/]/).at(-1)!;
  const metrics = JSON.parse(
    readFileSync(resolve(directory, "metrics.json"), "utf8")) as Metrics;
  const output = resolve(directory, "intelligibility.json");
  const scores: Intelligibility = existsSync(output)
    ? JSON.parse(readFileSync(output, "utf8")) as Intelligibility
    : { results: {} };
  for (const key of pendingClips(metrics, scores)) {
    const reference = metrics.results[key]!.text;
    const transcript = await transcribe(
      readFileSync(resolve(directory, `${key}.wav`)),
      `tts-intelligibility-${name}-${key}`.replace(/[^A-Za-z0-9_-]/g, "-"),
      origin,
    );
    const score = scoreClip(reference, transcript);
    scores.results[key] = score;
    writeFileSync(output, `${JSON.stringify(scores, null, 2)}\n`);
    console.log(`${name} ${key}: ${score.errors}/${score.words} word errors — ${transcript}`);
  }
  console.log(JSON.stringify({ run: name, ...summarize(scores) }));
}

async function main(): Promise<void> {
  const [outArg, originArg, ...runs] = process.argv.slice(2);
  if (!outArg || !originArg) {
    throw new Error("Usage: pnpm exec tsx scripts/tts-intelligibility.ts <comparison dir> <local Sodalis origin> [run ...]");
  }
  const origin = localOrigin(originArg);
  const out = resolve(outArg);
  const selected = runs.length ? runs : readdirSync(out, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() &&
      existsSync(resolve(out, entry.name, "metrics.json")))
    .map((entry) => entry.name)
    .sort();
  if (!selected.length) throw new Error(`No TTS runs were found in ${out}.`);
  for (const run of selected) await scoreRun(resolve(out, run), origin);
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
