/**
 * Compares LLM providers behind the Sodalis provider contract on a fixed Dutch prompt set
 * (task 0037): latency, JSON and utterance-schema validity, semantic actions, tokens, and cost.
 * Opt-in and networked: never part of `pnpm test`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { LlmContentFilterError, type LlmUsage } from "../apps/server/src/assistant/OpenAiCompatibleLlmProvider.js";
import {
  AZURE_LLM_REASONING_EFFORTS,
  createLlmProvider,
  type LlmProviderSettings,
} from "../apps/server/src/assistant/providers.js";
import type { AvailableAppAction } from "../packages/assistant/src/AssistantActions.js";
import {
  ASSISTANT_EXPRESSIONS,
  ASSISTANT_GESTURES,
  extractAssistantUtteranceTextPrefix,
  parseAssistantUtterance,
} from "../packages/assistant/src/AssistantUtterance.js";

const DEFAULT_CONFIGS = ["local", ...AZURE_LLM_REASONING_EFFORTS.map((effort) => `azure-${effort}`)];

interface Message {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface ExpectedAction {
  readonly id: string;
  /** `null` accepts any value of the schema type; other values must match. */
  readonly arguments: Readonly<Record<string, string | number | boolean | null>>;
}

interface Prompt {
  readonly id: string;
  readonly category: "chat" | "action";
  readonly messages: readonly Message[];
  readonly expectedAction: ExpectedAction | null;
}

interface PromptSet {
  readonly actions: readonly AvailableAppAction[];
  readonly prompts: readonly Prompt[];
}

interface Configuration {
  readonly label: string;
  readonly settings: LlmProviderSettings;
}

interface Score {
  readonly jsonValid: boolean;
  readonly schemaProblems: readonly string[];
  readonly actionId: string | null;
  readonly actionCorrect: boolean;
  readonly caption: string;
}

interface Sample extends Score {
  readonly config: string;
  readonly promptId: string;
  readonly category: Prompt["category"];
  readonly repetition: number;
  readonly firstTokenMs: number | null;
  /** When the caption could start: the first non-empty `text` prefix. */
  readonly firstTextMs: number | null;
  readonly totalMs: number;
  readonly usage: LlmUsage | null;
  readonly error: string | null;
  readonly contentFilter: boolean;
  readonly raw: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function argumentProblems(action: AvailableAppAction, value: unknown): string[] {
  if (!isRecord(value)) return [`action ${action.id}: arguments is not an object`];
  const problems: string[] = [];
  const { properties, required = [], additionalProperties } = action.inputSchema;
  for (const name of required) {
    if (!Object.hasOwn(value, name)) problems.push(`action ${action.id}: missing ${name}`);
  }
  for (const [name, argument] of Object.entries(value)) {
    const property = properties[name];
    if (!property) {
      if (additionalProperties === false) problems.push(`action ${action.id}: unexpected ${name}`);
      continue;
    }
    if (typeof argument !== property.type) {
      problems.push(`action ${action.id}: ${name} is not a ${property.type}`);
    } else if (property.enum && !property.enum.includes(argument as string | number | boolean)) {
      problems.push(`action ${action.id}: ${name} is not an allowed value`);
    } else if (property.maxLength !== undefined && typeof argument === "string" &&
        argument.length > property.maxLength) {
      problems.push(`action ${action.id}: ${name} is too long`);
    }
  }
  return problems;
}

/** Strict check of the utterance contract the system prompt asks for; Sodalis itself is lenient. */
function utteranceProblems(value: unknown, actions: readonly AvailableAppAction[]): string[] {
  if (!isRecord(value)) return ["not a JSON object"];
  const problems: string[] = [];
  if (typeof value.text !== "string" || !value.text.trim()) problems.push("text missing or empty");
  const affect = value.affect;
  if (!isRecord(affect)) problems.push("affect missing");
  else {
    if (!ASSISTANT_EXPRESSIONS.some((expression) => expression === affect.expression)) {
      problems.push("affect.expression invalid");
    }
    if (!inRange(affect.valence, -1, 1)) problems.push("affect.valence invalid");
    if (!inRange(affect.arousal, 0, 1)) problems.push("affect.arousal invalid");
    if (!inRange(affect.intensity, 0, 1)) problems.push("affect.intensity invalid");
  }
  if (typeof value.interruptible !== "boolean") problems.push("interruptible missing");
  if (value.gesture !== undefined && value.gesture !== null &&
      !ASSISTANT_GESTURES.some((gesture) => gesture === value.gesture)) {
    problems.push("gesture invalid");
  }
  if (value.action !== undefined && value.action !== null) {
    const action = value.action;
    const available = isRecord(action) ? actions.find((item) => item.id === action.id) : undefined;
    if (!isRecord(action) || typeof action.id !== "string") problems.push("action invalid");
    else if (!available) problems.push(`action ${action.id} is not available`);
    else problems.push(...argumentProblems(available, action.arguments));
  }
  return problems;
}

function argumentMatches(expected: string | number | boolean | null, actual: unknown): boolean {
  if (expected === null) {
    return actual !== undefined && actual !== null && actual !== "";
  }
  if (typeof expected === "string") {
    return typeof actual === "string" && actual.trim().toLowerCase() === expected.toLowerCase();
  }
  return actual === expected;
}

export function scoreResponse(raw: string, prompt: Prompt, actions: readonly AvailableAppAction[]): Score {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const record = isRecord(parsed) ? parsed : undefined;
  const utterance = parseAssistantUtterance(raw);
  // Score the action Sodalis would actually invoke, after its own lenient normalization.
  const action = utterance.action;
  const actionId = action?.id ?? null;
  const expected = prompt.expectedAction;
  const available = actions.find((item) => item.id === actionId);
  const actionArguments = isRecord(action?.arguments) ? action.arguments : {};
  const actionCorrect = expected === null
    ? actionId === null
    : actionId === expected.id && available !== undefined &&
      !argumentProblems(available, action?.arguments).length &&
      Object.entries(expected.arguments).every(([name, value]) =>
        argumentMatches(value, actionArguments[name]));
  return {
    jsonValid: record !== undefined,
    schemaProblems: utteranceProblems(parsed, actions),
    actionId,
    actionCorrect: record !== undefined && actionCorrect,
    caption: utterance.text,
  };
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!);
}

function mean(values: readonly number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function ratio(count: number, total: number): string {
  return total ? `${count}/${total} (${Math.round((count / total) * 100)}%)` : "n/a";
}

export interface Prices {
  /** Price per million input tokens. */
  readonly input: number;
  /** Price per million output tokens; reasoning tokens are billed as output. */
  readonly output: number;
  readonly currency: string;
}

export function summarize(samples: readonly Sample[], prices: Prices | null, billed: boolean) {
  const ok = samples.filter((sample) => sample.error === null);
  const chat = ok.filter((sample) => sample.category === "chat");
  const action = ok.filter((sample) => sample.category === "action");
  const usage = ok.flatMap((sample) => sample.usage ? [sample.usage] : []);
  const cost = billed && prices && usage.length
    ? usage.reduce((sum, item) =>
      sum + (item.promptTokens * prices.input + item.completionTokens * prices.output) / 1_000_000, 0)
    : null;
  const timing = (pick: (sample: Sample) => number | null) => {
    const values = ok.flatMap((sample) => {
      const value = pick(sample);
      return value === null ? [] : [value];
    });
    return { median: percentile(values, 0.5), p90: percentile(values, 0.9) };
  };
  return {
    samples: samples.length,
    failures: samples.length - ok.length,
    contentFilter: samples.filter((sample) => sample.contentFilter).length,
    jsonValid: ratio(ok.filter((sample) => sample.jsonValid).length, ok.length),
    schemaValid: ratio(ok.filter((sample) => !sample.schemaProblems.length).length, ok.length),
    chatWithoutAction: ratio(chat.filter((sample) => sample.actionCorrect).length, chat.length),
    actionCorrect: ratio(action.filter((sample) => sample.actionCorrect).length, action.length),
    firstTokenMs: timing((sample) => sample.firstTokenMs),
    firstTextMs: timing((sample) => sample.firstTextMs),
    totalMs: timing((sample) => sample.totalMs),
    meanTokens: {
      prompt: mean(usage.map((item) => item.promptTokens)),
      completion: mean(usage.map((item) => item.completionTokens)),
      reasoning: mean(usage.flatMap((item) => item.reasoningTokens === undefined ? [] : [item.reasoningTokens])),
    },
    cost: cost === null || !prices ? null : {
      currency: prices.currency,
      total: Number(cost.toFixed(4)),
      perTurn: Number((cost / usage.length).toFixed(5)),
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runSample(
  config: Configuration,
  prompt: Prompt,
  actions: readonly AvailableAppAction[],
  repetition: number,
  timeoutMs: number,
): Promise<Sample> {
  const provider = createLlmProvider(config.settings);
  const started = performance.now();
  let firstTokenMs: number | null = null;
  let firstTextMs: number | null = null;
  let raw = "";
  let usage: LlmUsage | null = null;
  let error: string | null = null;
  let contentFilter = false;
  try {
    for await (const text of provider.generate({
      messages: prompt.messages,
      availableActions: actions,
      signal: AbortSignal.timeout(timeoutMs),
      onUsage: (value) => { usage = value; },
    })) {
      if (!text) continue;
      firstTokenMs ??= performance.now() - started;
      raw += text;
      if (firstTextMs === null && extractAssistantUtteranceTextPrefix(raw)) {
        firstTextMs = performance.now() - started;
      }
    }
  } catch (caught) {
    error = errorMessage(caught);
    contentFilter = caught instanceof LlmContentFilterError;
  }
  const totalMs = performance.now() - started;
  return {
    config: config.label,
    promptId: prompt.id,
    category: prompt.category,
    repetition,
    firstTokenMs: firstTokenMs === null ? null : Math.round(firstTokenMs),
    firstTextMs: firstTextMs === null ? null : Math.round(firstTextMs),
    totalMs: Math.round(totalMs),
    usage,
    error,
    contentFilter,
    raw,
    ...scoreResponse(raw, prompt, actions),
  };
}

/** The host-side URL for an endpoint that `.env` addresses from inside a container. */
function hostUrl(value: string): string {
  return value.replace("://host.docker.internal", "://127.0.0.1");
}

function configurations(
  names: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  localUrl: string | undefined,
  localModel: string | undefined,
): Configuration[] {
  return names.map((name) => {
    if (name === "mock") {
      return { label: "mock", settings: { LLM_PROVIDER: "mock" } };
    }
    if (name === "local") {
      const baseUrl = localUrl ?? (env.LLM_BASE_URL ? hostUrl(env.LLM_BASE_URL) : undefined);
      const model = localModel ?? env.LLM_MODEL;
      if (!baseUrl || !model) {
        throw new Error("The local configuration needs LLM_BASE_URL and LLM_MODEL in .env, or --local-url and --local-model.");
      }
      return {
        label: `local:${model}`,
        settings: {
          LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: baseUrl, LLM_MODEL: model,
          ...(env.LLM_API_KEY ? { LLM_API_KEY: env.LLM_API_KEY } : {}),
        },
      };
    }
    const effort = AZURE_LLM_REASONING_EFFORTS.find((candidate) => name === `azure-${candidate}`);
    if (!effort) {
      throw new Error(`Unknown configuration "${name}"; use local, mock, or azure-<${
        AZURE_LLM_REASONING_EFFORTS.join("|")}>.`);
    }
    return {
      label: `azure:${env.AZURE_LLM_DEPLOYMENT ?? "?"}:${effort}`,
      settings: {
        LLM_PROVIDER: "azure",
        AZURE_LLM_URL: env.AZURE_LLM_URL,
        AZURE_LLM_KEY: env.AZURE_LLM_KEY,
        AZURE_LLM_DEPLOYMENT: env.AZURE_LLM_DEPLOYMENT,
        AZURE_LLM_REASONING_EFFORT: effort,
      },
    };
  });
}

function summaryTable(rows: readonly { label: string; summary: ReturnType<typeof summarize> }[]): string {
  const header = "| Configuration | Failures | JSON valid | Schema valid | Chat without action | Correct action | " +
    "First text median / p90 (ms) | Total median / p90 (ms) | Mean tokens in / out / reasoning | Cost per turn |";
  const lines = rows.map(({ label, summary }) =>
    `| ${label} | ${summary.failures}/${summary.samples}` +
    `${summary.contentFilter ? ` (${summary.contentFilter} content filter)` : ""} | ${summary.jsonValid} | ` +
    `${summary.schemaValid} | ${summary.chatWithoutAction} | ${summary.actionCorrect} | ` +
    `${summary.firstTextMs.median ?? "–"} / ${summary.firstTextMs.p90 ?? "–"} | ` +
    `${summary.totalMs.median ?? "–"} / ${summary.totalMs.p90 ?? "–"} | ` +
    `${summary.meanTokens.prompt ?? "–"} / ${summary.meanTokens.completion ?? "–"} / ${summary.meanTokens.reasoning ?? "–"} | ` +
    `${summary.cost ? `${summary.cost.perTurn} ${summary.cost.currency}` : "–"} |`);
  return [header, `|${" --- |".repeat(10)}`, ...lines].join("\n");
}

function reviewFile(set: PromptSet, labels: readonly string[], samples: readonly Sample[]): string {
  const sections = set.prompts.map((prompt) => {
    const lastUser = prompt.messages.at(-1)?.content ?? "";
    const expected = prompt.expectedAction
      ? `\`${prompt.expectedAction.id}\` ${JSON.stringify(prompt.expectedAction.arguments)}` : "none";
    const rows = labels.map((label) => {
      const runs = samples.filter((sample) => sample.config === label && sample.promptId === prompt.id);
      const first = runs[0];
      if (!first) return `| ${label} | – | – | – |`;
      const reply = first.error ? `**Error:** ${first.error}` : first.caption.replace(/\s+/g, " ").replace(/\|/g, "\\|");
      const action = first.actionId ?? "none";
      const correct = runs.filter((sample) => sample.actionCorrect).length;
      return `| ${label} | ${reply} | \`${action}\` | ${correct}/${runs.length} |`;
    });
    return [
      `### ${prompt.id}`,
      "",
      `> ${lastUser}`,
      "",
      `Expected action: ${expected}`,
      "",
      "| Configuration | Reply (repetition 1) | Action | Correct action, all repetitions |",
      "| --- | --- | --- | --- |",
      ...rows,
    ].join("\n");
  });
  const ratings = labels.map((label) => `| ${label} | | |`);
  return [
    "# LLM comparison review",
    "",
    "Rate each configuration from 1 to 10 for Dutch quality, tone, and appropriateness, " +
      "including whether it avoids claiming that actions succeeded.",
    "",
    "| Configuration | Rating (1–10) | Notes |",
    "| --- | --- | --- |",
    ...ratings,
    "",
    "## Prompts",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

function price(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative number.`);
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      env: { type: "string" },
      configs: { type: "string", default: DEFAULT_CONFIGS.join(",") },
      repetitions: { type: "string", default: "3" },
      "timeout-ms": { type: "string", default: "180000" },
      "local-url": { type: "string" },
      "local-model": { type: "string" },
      "input-price": { type: "string" },
      "output-price": { type: "string" },
      currency: { type: "string", default: "USD" },
      label: { type: "string" },
      rescore: { type: "string" },
    },
  });
  const root = resolve(import.meta.dirname, "..");
  const set = JSON.parse(readFileSync(resolve(root, "scripts/llm-prompts.json"), "utf8")) as PromptSet;
  const repetitions = positiveInteger(values.repetitions, "repetitions");
  const timeoutMs = positiveInteger(values["timeout-ms"], "timeout-ms");
  const input = price(values["input-price"], "input-price");
  const output = price(values["output-price"], "output-price");
  if ((input === undefined) !== (output === undefined)) {
    throw new Error("Pass both --input-price and --output-price (per million tokens), or neither.");
  }
  const prices = input === undefined || output === undefined
    ? null : { input, output, currency: values.currency };
  if (values.rescore) {
    rescore(resolve(root, values.rescore), set, prices);
    return;
  }
  // Like `pnpm stack:up --env`, an explicit overlay (for example .env.azure) replaces matching .env settings.
  const env = {
    ...parseEnv(readFileSync(resolve(root, ".env"), "utf8")),
    ...(values.env ? parseEnv(readFileSync(resolve(root, values.env), "utf8")) : {}),
  };
  const configs = configurations(
    values.configs.split(",").map((name) => name.trim()).filter(Boolean),
    env, values["local-url"], values["local-model"],
  );
  for (const config of configs) createLlmProvider(config.settings);

  const measuredAt = new Date().toISOString();
  const samples: Sample[] = [];
  for (const config of configs) {
    const warmup = await runSample(config, set.prompts[0]!, set.actions, 0, timeoutMs);
    console.log(`${config.label} warm-up (excluded): ` +
      (warmup.error ? `failed: ${warmup.error}` : `first text ${warmup.firstTextMs ?? "–"} ms, total ${warmup.totalMs} ms`));
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const prompt of set.prompts) {
        const sample = await runSample(config, prompt, set.actions, repetition, timeoutMs);
        samples.push(sample);
        console.log(`${config.label} #${repetition} ${prompt.id}: ` + (sample.error
          ? `ERROR ${sample.error}`
          : `${sample.totalMs} ms, action ${sample.actionId ?? "none"}` +
            `${sample.actionCorrect ? "" : " (wrong)"}${sample.schemaProblems.length ? ` [${sample.schemaProblems.join("; ")}]` : ""}`));
      }
    }
  }

  writeOutputs(resolve(root, "models/llm-eval", values.label ?? measuredAt.replace(/[:.]/g, "-")), set, {
    measuredAt, repetitions, timeoutMs, prices,
    configurations: configs.map((config) => config.label),
  }, samples);
}

interface RunMetadata {
  readonly measuredAt: string;
  readonly rescoredAt?: string;
  readonly repetitions: number;
  readonly timeoutMs: number;
  readonly prices: Prices | null;
  readonly configurations: readonly string[];
}

/** Azure configurations are billed; local and mock ones are not. */
function billed(label: string): boolean {
  return label.startsWith("azure:");
}

function writeOutputs(directory: string, set: PromptSet, metadata: RunMetadata, samples: readonly Sample[]): void {
  const rows = metadata.configurations.map((label) => ({
    label,
    summary: summarize(samples.filter((sample) => sample.config === label), metadata.prices, billed(label)),
  }));
  mkdirSync(directory, { recursive: true });
  const table = summaryTable(rows);
  writeFileSync(resolve(directory, "results.json"), `${JSON.stringify({
    ...metadata, summaries: Object.fromEntries(rows.map((row) => [row.label, row.summary])), samples,
  }, null, 2)}\n`);
  writeFileSync(resolve(directory, "summary.md"), `${table}\n`);
  writeFileSync(resolve(directory, "review.md"), reviewFile(set, metadata.configurations, samples));
  console.log(`\n${table}\n\nWrote results.json, summary.md and review.md to ${directory}`);
}

/** Re-scores stored raw responses with the current prompt set and rules, without new requests. */
function rescore(directory: string, set: PromptSet, prices: Prices | null): void {
  const stored = JSON.parse(readFileSync(resolve(directory, "results.json"), "utf8")) as
    RunMetadata & { readonly samples: readonly Sample[] };
  const prompts = new Map(set.prompts.map((prompt) => [prompt.id, prompt]));
  const samples = stored.samples.map((sample) => {
    const prompt = prompts.get(sample.promptId);
    if (!prompt) throw new Error(`Prompt "${sample.promptId}" is no longer in scripts/llm-prompts.json.`);
    return { ...sample, ...scoreResponse(sample.raw, prompt, set.actions) };
  });
  writeOutputs(directory, set, {
    measuredAt: stored.measuredAt, rescoredAt: new Date().toISOString(), repetitions: stored.repetitions,
    timeoutMs: stored.timeoutMs, prices: prices ?? stored.prices, configurations: stored.configurations,
  }, samples);
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
