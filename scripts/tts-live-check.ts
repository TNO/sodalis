/** Checks a running Sodalis speech API's TTS path: first-audio latency, PCM framing, and cancellation. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { localOrigin } from "./tts-intelligibility.js";

/** Concurrent TTS streams the Sodalis speech API admits; keep in step with `MAX_TTS_REQUESTS`. */
const SERVER_TTS_CAPACITY = 2;
/** Sodalis TTS PCM: 22,050 Hz, 16-bit mono. */
const PCM_BYTES_PER_SECOND = 22_050 * 2;
/** The speech API's `MAX_TTS_TEXT_LENGTH`. */
const MAX_TEXT_LENGTH = 5_000;
const WARMUP_TEXT = "Goedemorgen, dit is een opwarmzin.";

/** Why a TTS response is not valid Sodalis PCM, or null when it is. */
export function pcmProblem(contentType: string | null, byteLength: number): string | null {
  if (!contentType?.toLowerCase().startsWith("audio/pcm")) {
    return `unexpected content type ${contentType ?? "(none)"}`;
  }
  if (!byteLength) return "no audio was returned";
  if (byteLength % 2) return "incomplete 16-bit PCM sample";
  return null;
}

export interface Timing {
  readonly firstChunkMs: number;
  readonly totalMs: number;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function latencySummary(samples: readonly Timing[]): {
  count: number;
  medianFirstChunkMs: number | null;
  maxFirstChunkMs: number | null;
  medianTotalMs: number | null;
} {
  const first = samples.map((sample) => sample.firstChunkMs);
  return {
    count: samples.length,
    medianFirstChunkMs: median(first),
    maxFirstChunkMs: first.length ? Math.max(...first) : null,
    medianTotalMs: median(samples.map((sample) => sample.totalMs)),
  };
}

export interface Cancellation {
  /** Milliseconds from request to abort. */
  readonly abortAtMs: number;
  readonly audioBeforeAbort: boolean;
  /** Why the request failed before it could be cancelled. */
  readonly error?: string;
}

export interface CancellationEvidence {
  readonly capacity: number;
  /** Abort just after first audio (streaming providers) instead of after a fixed delay. */
  readonly cancelAfterFirstAudio: boolean;
  /** Duration of the same reply when it is not cancelled. */
  readonly fullReplyMs: number;
  readonly cancellations: readonly Cancellation[];
  readonly recovery: { readonly status: number; readonly pcmProblem: string | null; readonly waitedMs: number };
  readonly healthy: boolean;
  readonly maxRecoveryMs: number;
}

/**
 * Cancelling more in-flight replies than the server admits at once must leave it able to speak again.
 * An abort only counts as in flight when it came well before the uncancelled reply would have ended.
 */
export function cancellationVerdict(evidence: CancellationEvidence): { pass: boolean; problems: string[] } {
  const problems: string[] = [];
  if (evidence.cancellations.length <= evidence.capacity) {
    problems.push(`cancel more than ${evidence.capacity} streams to show capacity is released`);
  }
  evidence.cancellations.forEach((cancellation, index) => {
    const request = `request ${index + 1}`;
    if (cancellation.error) {
      problems.push(`${request} failed before cancellation: ${cancellation.error}`);
    } else if (evidence.cancelAfterFirstAudio && !cancellation.audioBeforeAbort) {
      problems.push(`${request} produced no audio before cancellation`);
    } else if (cancellation.abortAtMs >= evidence.fullReplyMs / 2) {
      problems.push(`${request} was cancelled at ${Math.round(cancellation.abortAtMs)} ms, but the whole reply ` +
        `takes ${Math.round(evidence.fullReplyMs)} ms, so synthesis may already have finished`);
    }
  });
  const { recovery } = evidence;
  if (recovery.status !== 200) {
    problems.push(`speech after cancellation returned HTTP ${recovery.status}`);
  } else if (recovery.pcmProblem) {
    problems.push(`speech after cancellation was invalid: ${recovery.pcmProblem}`);
  }
  if (recovery.waitedMs > evidence.maxRecoveryMs) {
    problems.push(`speech after cancellation needed ${recovery.waitedMs} ms ` +
      `(limit ${evidence.maxRecoveryMs} ms)`);
  }
  if (!evidence.healthy) problems.push("speech API health check failed after cancellation");
  return { pass: !problems.length, problems };
}

/** The shortest, the median-length, and the longest sentence. */
export function liveSentences(sentences: readonly string[]): { label: string; text: string }[] {
  const sorted = [...sentences].sort((a, b) => a.length - b.length);
  return [
    { label: "short", text: sorted[0]! },
    { label: "medium", text: sorted[sorted.length >> 1]! },
    { label: "long", text: sorted.at(-1)! },
  ];
}

/** Consecutive corpus sentences of at least `minLength` characters, so synthesis outlasts the abort. */
export function cancellationText(sentences: readonly string[], minLength = 1_000): string {
  let text = "";
  for (const sentence of sentences) {
    const next = text ? `${text} ${sentence}` : sentence;
    if (next.length > MAX_TEXT_LENGTH) break;
    text = next;
    if (text.length >= minLength) break;
  }
  return text;
}

interface Spoken {
  readonly status: number;
  readonly pcmProblem: string | null;
  readonly firstChunkMs: number | null;
  readonly totalMs: number;
  readonly bytes: number;
  readonly error?: string;
}

let speechCounter = 0;

/**
 * POST one reply to the public TTS route. `cancel` abandons it just after first audio, or after a fixed
 * number of milliseconds; `abortAtMs` then records when the abort happened.
 */
async function speak(origin: string, text: string, language: string,
  cancel?: "first-audio" | number): Promise<Spoken & { abortAtMs?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timed out after 120 s")), 120_000);
  const start = performance.now();
  let firstChunkMs: number | null = null;
  let bytes = 0;
  let abortAtMs: number | undefined;
  const abort = () => {
    abortAtMs ??= performance.now() - start;
    controller.abort(new DOMException("Live check cancelled playback.", "AbortError"));
  };
  const delayed = typeof cancel === "number" ? setTimeout(abort, cancel) : undefined;
  const elapsed = () => performance.now() - start;
  try {
    const response = await fetch(`${origin}/api/speech/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "tts-live-check", speechId: `tts-live-${process.pid}-${speechCounter += 1}`, text, language,
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      return { status: response.status, pcmProblem: null, firstChunkMs, bytes, totalMs: elapsed(),
        error: `HTTP ${response.status} ${(await response.text()).slice(0, 200)}` };
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.byteLength) continue;
      firstChunkMs ??= elapsed();
      bytes += value.byteLength;
      if (cancel === "first-audio") {
        abort();
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    return {
      status: response.status,
      pcmProblem: cancel === undefined ? pcmProblem(response.headers.get("content-type"), bytes) : null,
      firstChunkMs, bytes, totalMs: elapsed(), ...(abortAtMs === undefined ? {} : { abortAtMs }),
    };
  } catch (error) {
    if (abortAtMs !== undefined) return { status: 0, pcmProblem: null, firstChunkMs, bytes, totalMs: elapsed(), abortAtMs };
    return { status: 0, pcmProblem: null, firstChunkMs, bytes, totalMs: elapsed(),
      error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
    clearTimeout(delayed);
  }
}

const round = (value: number | null) => value === null ? null : Math.round(value);

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      language: { type: "string", default: "nl-NL" },
      repeats: { type: "string", default: "3" },
      "max-recovery-ms": { type: "string", default: "3000" },
      "cancel-after-ms": { type: "string" },
    },
  });
  const [originArg, label] = positionals;
  if (!originArg || !label || !/^[A-Za-z0-9_-]+$/.test(label)) {
    throw new Error("Usage: pnpm exec tsx scripts/tts-live-check.ts <local Sodalis origin> <provider label> " +
      "[--language nl-NL] [--repeats 3] [--max-recovery-ms 3000] [--cancel-after-ms <ms>]");
  }
  const origin = localOrigin(originArg);
  const root = resolve(import.meta.dirname, "..");
  const sentences = JSON.parse(readFileSync(resolve(root, "scripts/tts-sentences.json"), "utf8")) as string[];
  const language = values.language;
  const repeats = positiveInteger(values.repeats, "repeats");
  const maxRecoveryMs = positiveInteger(values["max-recovery-ms"], "max-recovery-ms");
  const cancel = values["cancel-after-ms"] === undefined
    ? "first-audio" as const : positiveInteger(values["cancel-after-ms"], "cancel-after-ms");

  const warmup = await speak(origin, WARMUP_TEXT, language);
  if (warmup.status !== 200 || warmup.pcmProblem) {
    // The speech API sends headers before synthesis starts, so provider errors surface as a broken stream.
    throw new Error(`Warm-up failed: ${warmup.pcmProblem ?? warmup.error ?? "no audio"}; ` +
      "check the speech service log for the provider's error.");
  }
  console.log(`warm-up (excluded): first audio ${round(warmup.firstChunkMs)} ms, total ${round(warmup.totalMs)} ms`);

  const [short, medium] = liveSentences(sentences);
  const latency = [];
  const problems: string[] = [];
  for (const sentence of liveSentences(sentences)) {
    const samples = [];
    for (let attempt = 1; attempt <= repeats; attempt += 1) {
      const spoken = await speak(origin, sentence.text, language);
      if (spoken.status !== 200 || spoken.pcmProblem || spoken.firstChunkMs === null) {
        problems.push(`${sentence.label} #${attempt}: ${spoken.pcmProblem ?? spoken.error ?? "no audio"}`);
        continue;
      }
      samples.push({ firstChunkMs: spoken.firstChunkMs, totalMs: spoken.totalMs,
        audioSeconds: spoken.bytes / PCM_BYTES_PER_SECOND });
      console.log(`${sentence.label} #${attempt}: first audio ${round(spoken.firstChunkMs)} ms, ` +
        `total ${round(spoken.totalMs)} ms, ${(spoken.bytes / PCM_BYTES_PER_SECOND).toFixed(2)} s audio`);
    }
    const summary = latencySummary(samples);
    latency.push({ ...sentence, characters: sentence.text.length, ...summary,
      medianFirstChunkMs: round(summary.medianFirstChunkMs), maxFirstChunkMs: round(summary.maxFirstChunkMs),
      medianTotalMs: round(summary.medianTotalMs),
      audioSeconds: samples[0] ? Number(samples[0].audioSeconds.toFixed(2)) : null });
  }

  const longReply = cancellationText(sentences);
  const full = await speak(origin, longReply, language);
  if (full.status !== 200 || full.pcmProblem) {
    problems.push(`uncancelled long reply: ${full.pcmProblem ?? full.error ?? "no audio"}`);
  }
  console.log(`long reply (${longReply.length} characters, uncancelled): first audio ` +
    `${round(full.firstChunkMs)} ms, total ${round(full.totalMs)} ms`);
  const cancellations: Cancellation[] = [];
  for (let index = 0; index <= SERVER_TTS_CAPACITY; index += 1) {
    const cancelled = await speak(origin, longReply, language, cancel);
    cancellations.push({
      abortAtMs: Math.round(cancelled.abortAtMs ?? cancelled.totalMs),
      audioBeforeAbort: cancelled.firstChunkMs !== null,
      ...(cancelled.error ? { error: cancelled.error } : {}),
    });
    console.log(`cancellation ${index + 1}: ` + (cancelled.error ?? `cancelled at ${round(cancelled.abortAtMs ?? null)} ms, ` +
      `first audio ${cancelled.firstChunkMs === null ? "none" : `${round(cancelled.firstChunkMs)} ms`}`));
  }
  const recoveryStart = performance.now();
  let recovered: Spoken;
  do {
    recovered = await speak(origin, short!.text, language);
    if (recovered.status === 200) break;
    await new Promise((done) => setTimeout(done, 100));
  } while (performance.now() - recoveryStart < maxRecoveryMs);
  const recovery = { status: recovered.status, pcmProblem: recovered.pcmProblem,
    waitedMs: Math.round(performance.now() - recoveryStart - recovered.totalMs +
      (recovered.firstChunkMs ?? recovered.totalMs)) };
  const after = await speak(origin, medium!.text, language);
  const verdict = cancellationVerdict({
    capacity: SERVER_TTS_CAPACITY, cancelAfterFirstAudio: cancel === "first-audio", fullReplyMs: full.totalMs,
    cancellations, recovery, maxRecoveryMs, healthy: after.status === 200 && !after.pcmProblem,
  });
  console.log(`recovery: HTTP ${recovery.status}, audio after ${recovery.waitedMs} ms; ` +
    `cancellation ${verdict.pass ? "passed" : `FAILED: ${verdict.problems.join("; ")}`}`);

  const report = {
    label, origin, language, measuredAt: new Date().toISOString(), repeats,
    warmup: { firstChunkMs: round(warmup.firstChunkMs), totalMs: round(warmup.totalMs) },
    latency, latencyProblems: problems,
    cancellation: {
      mode: cancel === "first-audio" ? "after first audio" : `after ${cancel} ms`,
      capacity: SERVER_TTS_CAPACITY, characters: longReply.length,
      fullReply: { firstChunkMs: round(full.firstChunkMs), totalMs: round(full.totalMs),
        audioSeconds: Number((full.bytes / PCM_BYTES_PER_SECOND).toFixed(2)) },
      cancellations, recovery, maxRecoveryMs, ...verdict,
    },
  };
  const directory = resolve(root, "models/tts-live");
  mkdirSync(directory, { recursive: true });
  const output = resolve(directory, `${label}.json`);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${output}`);
  if (problems.length || !verdict.pass) process.exitCode = 1;
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
