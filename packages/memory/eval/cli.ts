import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  LOCOMO_URL,
  LONGMEMEVAL_S_URL,
  parseLoCoMo,
  parseLongMemEval,
  translateCase,
} from "./benchmarks.js";
import type { EvalCase } from "./cases.js";
import { assertLocalOnly, chatClient, rolesFromEnv, type ChatRole } from "./config.js";
import { runCase, type CaseResult } from "./harness.js";
import { benchmarkIndex } from "./indexBench.js";
import { componentMetrics, qaMetrics, roleSummary } from "./metrics.js";
import { fetchPersonas, FIXTURE_PERSONAS, type Persona } from "./personas.js";
import { LlmRenderer, renderScenario, TemplateRenderer, type Renderer } from "./render.js";
import { generateScenario } from "./scenario.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), ".data");
const USAGE = `Usage: pnpm --filter @sodalis/memory eval <command> [options]

Commands:
  personas   --count 10 [--min-age 70] [--seed 1]       download personas
  generate   [--seed 1] [--sessions 6] [--renderer template|llm] [--fixtures]
  translate  [--limit 100] [--distractors 4]           Dutch LongMemEval-S subset
  run        --set synthetic|longmemeval|longmemeval-nl|locomo [--limit N]
             [--file synthetic.json] [--distractors N] [--types a,b] [--system2] [--threshold 0.3] [--label name]
  bench-index [--items 10000] [--dims 512]

Model roles come from EVAL_<ROLE>_BASE_URL/_MODEL/... (see eval/README.md).
Runs that send data to a non-local URL require --allow-cloud and the user's
consent for that run.`;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function cached(url: string, name: string): Promise<string> {
  const path = join(DATA, "downloads", name);
  if (!existsSync(path)) {
    console.error(`Downloading ${url} …`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
  }
  return path;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      count: { type: "string" },
      "min-age": { type: "string" },
      seed: { type: "string" },
      sessions: { type: "string" },
      renderer: { type: "string" },
      fixtures: { type: "boolean" },
      limit: { type: "string" },
      distractors: { type: "string" },
      types: { type: "string" },
      set: { type: "string" },
      system2: { type: "boolean" },
      threshold: { type: "string" },
      label: { type: "string" },
      file: { type: "string" },
      items: { type: "string" },
      dims: { type: "string" },
      "allow-cloud": { type: "boolean" },
    },
  });
  const command = positionals[0];
  const seed = Number(values.seed ?? 1);
  const allowCloud = values["allow-cloud"] === true;
  const env = process.env;

  if (command === "personas") {
    const personas = await fetchPersonas({ count: Number(values.count ?? 10), minAge: Number(values["min-age"] ?? 70), seed });
    await writeJson(join(DATA, "personas.json"), personas);
    console.log(`Saved ${personas.length} personas to ${join(DATA, "personas.json")}.`);
    return;
  }

  if (command === "generate") {
    const personas = values.fixtures
      ? [...FIXTURE_PERSONAS]
      : await readJson<Persona[]>(join(DATA, "personas.json")).catch(() => {
          throw new Error("Run the personas command first, or pass --fixtures.");
        });
    let renderer: Renderer = new TemplateRenderer();
    if (values.renderer === "llm") {
      assertLocalOnly(env, ["RENDER", "JUDGE"], allowCloud);
      if (env.EVAL_RENDER_MODEL && env.EVAL_RENDER_MODEL === env.EVAL_EXTRACT_MODEL) {
        throw new Error("The rendering model must differ from the extraction model under test.");
      }
      renderer = new LlmRenderer(chatClient(env, "RENDER"), chatClient(env, "JUDGE"));
    }
    const cases: EvalCase[] = [];
    for (const persona of personas) {
      const scenario = generateScenario(persona, seed, { sessions: Number(values.sessions ?? 6) });
      cases.push(await renderScenario(scenario, renderer));
      console.error(`Rendered ${scenario.id}`);
    }
    const path = join(DATA, "synthetic", `${renderer.id.replace(/[^\w.-]+/g, "_")}-${seed}.json`);
    await writeJson(path, cases);
    if (renderer instanceof LlmRenderer && renderer.failures.length) {
      console.error(`${renderer.failures.length} sessions fell back to templates after failed verification.`);
    }
    console.log(`Saved ${cases.length} cases to ${path}.`);
    return;
  }

  if (command === "translate") {
    assertLocalOnly(env, ["TRANSLATE"], allowCloud);
    const records = await readJson<Parameters<typeof parseLongMemEval>[0]>(await cached(LONGMEMEVAL_S_URL, "longmemeval_s_cleaned.json"));
    const cases = parseLongMemEval(records, {
      limit: Number(values.limit ?? 100),
      seed,
      distractorSessions: Number(values.distractors ?? 4),
    });
    const client = chatClient(env, "TRANSLATE");
    const translated: EvalCase[] = [];
    for (const evalCase of cases) {
      translated.push(await translateCase(evalCase, client));
      console.error(`Translated ${translated.length}/${cases.length}`);
    }
    await writeJson(join(DATA, "longmemeval-nl.json"), translated);
    console.log(`Saved ${translated.length} cases. Spot-check a sample by hand before use.`);
    return;
  }

  if (command === "run") {
    const roles: ChatRole[] = ["GATE", "EXTRACT", "RECONCILE", "ANSWER", "JUDGE", ...(values.system2 ? (["INDUCE"] as const) : [])];
    assertLocalOnly(env, roles, allowCloud);
    const limit = values.limit ? Number(values.limit) : undefined;
    let cases: EvalCase[];
    switch (values.set) {
      case "synthetic": {
        const file = values.file ?? join(DATA, "synthetic", `template-${seed}.json`);
        cases = (await readJson<EvalCase[]>(file)).slice(0, limit);
        break;
      }
      case "longmemeval":
        cases = parseLongMemEval(await readJson(await cached(LONGMEMEVAL_S_URL, "longmemeval_s_cleaned.json")), {
          seed,
          ...(limit ? { limit } : {}),
          ...(values.types ? { types: values.types.split(",") } : {}),
          ...(values.distractors ? { distractorSessions: Number(values.distractors) } : {}),
        });
        break;
      case "longmemeval-nl":
        cases = (await readJson<EvalCase[]>(join(DATA, "longmemeval-nl.json"))).slice(0, limit);
        break;
      case "locomo":
        cases = parseLoCoMo(await readJson(await cached(LOCOMO_URL, "locomo10.json")), limit ? { limit } : {});
        break;
      default:
        throw new Error(USAGE);
    }
    const { roles: evalRoles, stats } = rolesFromEnv(env);
    const results: CaseResult[] = [];
    for (const evalCase of cases) {
      const result = await runCase(evalCase, evalRoles, {
        ...(values.system2 ? { system2: true } : {}),
        ...(values.threshold ? { gateThreshold: Number(values.threshold) } : {}),
      });
      results.push(result);
      const correct = result.questions.filter((question) => question.correct).length;
      console.error(`${evalCase.id}: ${correct}/${result.questions.length} correct, ${result.items} items`);
    }
    const byId = new Map(cases.map((evalCase) => [evalCase.id, evalCase.events]));
    const report = {
      label: values.label ?? values.set,
      set: values.set,
      cases: cases.length,
      system2: values.system2 === true,
      models: Object.fromEntries(
        ["EMBED", ...roles].map((role) => [role.toLowerCase(), env[`EVAL_${role}_MODEL`] ?? "(fallback)"]),
      ),
      components: cases.some((evalCase) => evalCase.events) ? componentMetrics(results, (id) => byId.get(id)) : undefined,
      qa: qaMetrics(results),
      roles: roleSummary(stats()),
      ingestMs: results.reduce((sum, result) => sum + result.ingestMs, 0),
      embedMs: results.reduce((sum, result) => sum + result.embedMs, 0),
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeJson(join(DATA, "results", `${report.label}-${stamp}.json`), { report, results });
    console.log(JSON.stringify(report, null, 2));
    console.log(`QA accuracy: ${percent(report.qa.overall.rate)} (${report.qa.overall.correct}/${report.qa.overall.total})`);
    return;
  }

  if (command === "bench-index") {
    const items = Number(values.items ?? 10_000);
    console.log(JSON.stringify(await benchmarkIndex({ items, dimensions: Number(values.dims ?? 512) }), null, 2));
    return;
  }

  console.log(USAGE);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
