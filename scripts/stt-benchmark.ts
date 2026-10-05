import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface MlsSample {
  readonly id: string;
  readonly speaker: string;
  readonly durationSeconds: number;
  readonly reference: string;
}

function words(text: string): string[] {
  return text.toLocaleLowerCase("nl-NL").match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function countWordErrors(
  reference: string,
  hypothesis: string,
): { errors: number; words: number } {
  const expected = words(reference);
  const actual = words(hypothesis);
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const next = [row];
    for (let column = 1; column <= actual.length; column += 1) {
      next.push(Math.min(
        previous[column]! + 1,
        next[column - 1]! + 1,
        previous[column - 1]! +
          (expected[row - 1] === actual[column - 1] ? 0 : 1),
      ));
    }
    previous = next;
  }
  return { errors: previous[actual.length]!, words: expected.length };
}

export function selectSamples(
  transcripts: string,
  segments: string,
): MlsSample[] {
  const references = new Map(
    transcripts.trim().split("\n").map((line) => {
      const [id, text] = line.split("\t", 2);
      return [id, text] as const;
    }),
  );
  const bySpeaker = new Map<string, MlsSample>();
  for (const line of segments.trim().split("\n")) {
    const [id, , start, end] = line.split("\t");
    const reference = references.get(id);
    const speaker = id?.split("_")[0];
    const durationSeconds = Number(end) - Number(start);
    if (!id || !speaker || !reference || words(reference).length < 8 ||
        !Number.isFinite(durationSeconds) || durationSeconds < 3 ||
        durationSeconds > 30) continue;
    const existing = bySpeaker.get(speaker);
    if (!existing || id < existing.id) {
      bySpeaker.set(speaker, { id, speaker, durationSeconds, reference });
    }
  }
  return [...bySpeaker.values()].sort((a, b) =>
    Number(a.speaker) - Number(b.speaker));
}

async function checkedResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(`STT returned HTTP ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function benchmarkSample(
  sample: MlsSample,
  dataset: string,
  origin: string,
): Promise<{ text: string; latencyMs: number }> {
  const [, chapter] = sample.id.split("_");
  const input = resolve(dataset, "test", "audio", sample.speaker, chapter!,
    `${sample.id}.flac`);
  const audio = execFileSync("ffmpeg", [
    "-v", "error", "-i", input, "-ar", "16000", "-ac", "1",
    "-f", "wav", "pipe:1",
  ], { maxBuffer: 16 * 1024 * 1024 });
  const sessionId = `benchmark-${sample.id}`;
  const endpoint = `${origin}/api/speech/stt/sessions/${sessionId}`;
  const startedAt = performance.now();
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
      throw new Error(`STT returned an invalid transcript for ${sample.id}.`);
    }
    return { text: result.text, latencyMs: performance.now() - startedAt };
  } catch (error) {
    const cleanup = await fetch(endpoint, { method: "DELETE" });
    if (!cleanup.ok && cleanup.status !== 404) {
      console.error(`Unable to clean up ${sessionId}: HTTP ${cleanup.status}`);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const [datasetArg, originArg] = process.argv.slice(2);
  if (!datasetArg || !originArg) {
    throw new Error("Usage: pnpm exec tsx scripts/stt-benchmark.ts <MLS root> <local Sodalis origin>");
  }
  const url = new URL(originArg);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.protocol !== "http:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("The MLS benchmark requires a local HTTP origin without credentials.");
  }
  const dataset = resolve(datasetArg);
  const origin = url.origin;
  const samples = selectSamples(
    readFileSync(resolve(dataset, "test", "transcripts.txt"), "utf8"),
    readFileSync(resolve(dataset, "test", "segments.txt"), "utf8"),
  );
  if (!samples.length) throw new Error("No MLS Dutch test samples were found.");
  let errors = 0;
  let referenceWords = 0;
  for (const sample of samples) {
    const { text, latencyMs } = await benchmarkSample(sample, dataset, origin);
    const score = countWordErrors(sample.reference, text);
    errors += score.errors;
    referenceWords += score.words;
    console.log(JSON.stringify({
      id: sample.id, durationSeconds: sample.durationSeconds,
      latencyMs: Math.round(latencyMs),
      wordErrorRate: score.errors / score.words,
      reference: sample.reference, transcript: text,
    }));
  }
  console.log(JSON.stringify({
    samples: samples.length, errors, referenceWords,
    wordErrorRate: errors / referenceWords,
  }));
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
