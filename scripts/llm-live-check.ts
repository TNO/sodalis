/**
 * Checks a running Sodalis AI API end to end for the currently selected LLM provider: streamed
 * round trips, utterance validity, and cancellation after the first chunk (task 0037).
 * Opt-in and networked: never part of `pnpm test`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { localOrigin } from "./tts-intelligibility.js";

/** Concurrent turns the Sodalis AI API admits; keep in step with `maxConcurrentRequests`. */
const SERVER_TURN_CAPACITY = 4;
const SHORT_PROMPT = "Goedemiddag! Hoe gaat het met je?";
const LONG_PROMPT = "Vertel een rustig verhaal van minstens twaalf zinnen over een wandeling langs de zee.";

interface Turn {
  readonly status: number;
  readonly firstChunkMs: number | null;
  readonly totalMs: number;
  readonly text: string;
  readonly abortAtMs: number | null;
  readonly error: string | null;
}

let turnCounter = 0;

async function turn(origin: string, prompt: string, cancelAfterFirstChunk = false): Promise<Turn> {
  turnCounter += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Timed out after 180 s.")), 180_000);
  const started = performance.now();
  let firstChunkMs: number | null = null;
  let abortAtMs: number | null = null;
  let text = "";
  let status = 0;
  try {
    const response = await fetch(`${origin}/api/assistant/turns`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        sessionId: "llm-live-check",
        turnId: `turn-${Date.now()}-${turnCounter}`,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    status = response.status;
    if (!response.ok || !response.body) {
      return { status, firstChunkMs, totalMs: performance.now() - started, text,
        abortAtMs, error: (await response.text()).slice(0, 300) || `HTTP ${status}` };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let delimiter = buffer.indexOf("\n\n");
      while (delimiter >= 0) {
        const data = buffer.slice(0, delimiter).split("\n")
          .filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        buffer = buffer.slice(delimiter + 2);
        if (data) {
          const chunk = JSON.parse(data) as { text?: unknown };
          if (typeof chunk.text === "string") text += chunk.text;
          firstChunkMs ??= performance.now() - started;
          if (cancelAfterFirstChunk) {
            abortAtMs = performance.now() - started;
            await reader.cancel();
            return { status, firstChunkMs, totalMs: performance.now() - started, text, abortAtMs, error: null };
          }
        }
        delimiter = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    return { status, firstChunkMs, totalMs: performance.now() - started, text, abortAtMs, error: null };
  } catch (error) {
    return { status, firstChunkMs, totalMs: performance.now() - started, text, abortAtMs,
      error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function utteranceProblem(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return "not a JSON object";
    const record = parsed as Record<string, unknown>;
    if (typeof record.text !== "string" || !record.text.trim()) return "missing text";
    return null;
  } catch {
    return "invalid JSON";
  }
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      repeats: { type: "string", default: "3" },
      "max-recovery-ms": { type: "string", default: "5000" },
    },
  });
  const [originArg, label] = positionals;
  if (!originArg || !label || !/^[A-Za-z0-9_.-]+$/.test(label)) {
    throw new Error("Usage: pnpm exec tsx scripts/llm-live-check.ts <local Sodalis origin> <provider label> " +
      "[--repeats 3] [--max-recovery-ms 5000]");
  }
  const origin = localOrigin(originArg);
  const repeats = positiveInteger(values.repeats, "repeats");
  const maxRecoveryMs = positiveInteger(values["max-recovery-ms"], "max-recovery-ms");
  const problems: string[] = [];

  const warmup = await turn(origin, SHORT_PROMPT);
  if (warmup.error) {
    throw new Error(`Warm-up failed: ${warmup.error}; check the ai service log for the provider's error.`);
  }
  console.log(`warm-up (excluded): first chunk ${round(warmup.firstChunkMs)} ms, total ${round(warmup.totalMs)} ms`);

  const roundTrips = [];
  for (let attempt = 1; attempt <= repeats; attempt += 1) {
    const result = await turn(origin, SHORT_PROMPT);
    const problem = result.error ?? utteranceProblem(result.text);
    if (problem) problems.push(`round trip #${attempt}: ${problem}`);
    roundTrips.push({ firstChunkMs: round(result.firstChunkMs), totalMs: round(result.totalMs), problem });
    console.log(`round trip #${attempt}: first chunk ${round(result.firstChunkMs)} ms, total ` +
      `${round(result.totalMs)} ms${problem ? ` — ${problem}` : ""}`);
  }

  const full = await turn(origin, LONG_PROMPT);
  if (full.error) problems.push(`uncancelled long reply: ${full.error}`);
  console.log(`long reply (uncancelled): first chunk ${round(full.firstChunkMs)} ms, total ${round(full.totalMs)} ms`);

  // One more than capacity: a leaked slot after cancellation would make the last turns fail with 503.
  const cancellations = [];
  for (let index = 1; index <= SERVER_TURN_CAPACITY + 1; index += 1) {
    const cancelled = await turn(origin, LONG_PROMPT, true);
    if (cancelled.error) problems.push(`cancellation ${index}: ${cancelled.error}`);
    else if (cancelled.abortAtMs === null) problems.push(`cancellation ${index}: reply ended before a chunk arrived`);
    cancellations.push({ status: cancelled.status, firstChunkMs: round(cancelled.firstChunkMs),
      abortAtMs: round(cancelled.abortAtMs), error: cancelled.error });
    console.log(`cancellation ${index}: ` + (cancelled.error ??
      `HTTP ${cancelled.status}, cancelled at ${round(cancelled.abortAtMs)} ms`));
  }

  const recoveryStart = performance.now();
  let recovered: Turn;
  do {
    recovered = await turn(origin, SHORT_PROMPT);
    if (recovered.status === 200 && !recovered.error) break;
    await new Promise((done) => setTimeout(done, 100));
  } while (performance.now() - recoveryStart < maxRecoveryMs);
  const recoveryProblem = recovered.error ?? utteranceProblem(recovered.text);
  if (recoveryProblem) problems.push(`recovery: ${recoveryProblem}`);
  console.log(`recovery: HTTP ${recovered.status}, total ${round(recovered.totalMs)} ms` +
    `${recoveryProblem ? ` — ${recoveryProblem}` : ""}`);

  const report = {
    label, origin, measuredAt: new Date().toISOString(), repeats, capacity: SERVER_TURN_CAPACITY,
    warmup: { firstChunkMs: round(warmup.firstChunkMs), totalMs: round(warmup.totalMs) },
    roundTrips,
    longReply: { firstChunkMs: round(full.firstChunkMs), totalMs: round(full.totalMs), characters: full.text.length },
    cancellations,
    recovery: { status: recovered.status, totalMs: round(recovered.totalMs), problem: recoveryProblem },
    problems,
    pass: problems.length === 0,
  };
  const directory = resolve(import.meta.dirname, "..", "models/llm-live");
  mkdirSync(directory, { recursive: true });
  const output = resolve(directory, `${label}.json`);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.pass ? "PASSED" : `FAILED: ${problems.join("; ")}`}\nWrote ${output}`);
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
