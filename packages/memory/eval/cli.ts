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
  parseCsv,
  parsePersonaMem,
  PERSONAMEM_BENCHMARK_URL,
  PERSONAMEM_FILE_URL,
  selectPersonaMemRows,
  translateCase,
  type PersonaMemHistory,
} from "./benchmarks.js";
import type { EvalCase } from "./cases.js";
import { assertLocalOnly, chatClient, rolesFromEnv, type ChatRole } from "./config.js";
import { rejudge, runCase, type CaseResult } from "./harness.js";
import { benchmarkIndex } from "./indexBench.js";
import { componentMetrics, qaMetrics, roleSummary } from "./metrics.js";
import { fetchPersonas, FIXTURE_PERSONAS, type Persona } from "./personas.js";
import { LlmRenderer, renderScenario, TemplateRenderer, type Renderer } from "./render.js";
import { generateScenario } from "./scenario.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), ".data");
const USAGE = `Usage: pnpm --filter @sodalis/memory eval <command> [options]

Commands:
  personas   --count 10 [--min-age 70] [--seed 1]       download personas
  generate   [--seed 1] [--sessions 6] [--renderer template|llm] [--fixtures] [--concurrency 1]
                                                       (resumable)
  translate  [--limit 100] [--per-type N] [--types a,b] [--distractors 2] [--assistant-chars 400]
                                                       Dutch LongMemEval-S subset (resumable)
  run        --set synthetic|longmemeval|longmemeval-nl|locomo|personamem [--limit N]
             [--file synthetic.json] [--distractors N] [--types a,b] [--per-type N] [--personas 4]
             [--system2 | --system2-compare] [--min-cluster 3] [--no-recall] [--no-memory] [--concurrency 1]
             [--threshold 0.1] [--label name]
  rejudge    --file a.json[,b.json]                    re-grade free-form answers
                                                       with the JUDGE role (e.g. a thinking model)
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
      "system2-compare": { type: "boolean" },
      "no-recall": { type: "boolean" },
      "no-memory": { type: "boolean" },
      concurrency: { type: "string" },
      personas: { type: "string" },
      "min-cluster": { type: "string" },
      "per-type": { type: "string" },
      "assistant-chars": { type: "string" },
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
    const path = join(DATA, "synthetic", `${renderer.id.replace(/[^\w.-]+/g, "_")}-${seed}.json`);
    const scenarios = personas.map((persona) => generateScenario(persona, seed, { sessions: Number(values.sessions ?? 6) }));
    const saved = await readJson<EvalCase[]>(path).catch((): EvalCase[] => []);
    const byId = new Map(saved.map((evalCase) => [evalCase.id, evalCase]));
    const pending = scenarios.filter((scenario) => !byId.has(`synthetic:${scenario.id}`));
    let writes = Promise.resolve();
    const worker = async () => {
      for (let scenario = pending.shift(); scenario; scenario = pending.shift()) {
        byId.set(`synthetic:${scenario.id}`, await renderScenario(scenario, renderer));
        const snapshot = scenarios.flatMap((item) => byId.get(`synthetic:${item.id}`) ?? []);
        writes = writes.then(() => writeJson(path, snapshot));
        await writes;
        console.error(`Rendered ${scenario.id}`);
      }
    };
    await Promise.all(Array.from({ length: Number(values.concurrency ?? 1) }, worker));
    const cases = scenarios.flatMap((item) => byId.get(`synthetic:${item.id}`) ?? []);
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
      distractorSessions: Number(values.distractors ?? 2),
      ...(values["per-type"] ? { perType: Number(values["per-type"]) } : {}),
      ...(values.types ? { types: values.types.split(",") } : {}),
    });
    const client = chatClient(env, "TRANSLATE");
    const path = join(DATA, "longmemeval-nl.json");
    const translated: EvalCase[] = await readJson<EvalCase[]>(path).catch(() => []);
    const done = new Set(translated.map((evalCase) => evalCase.id));
    for (const evalCase of cases) {
      if (done.has(`${evalCase.id}:nl`)) continue;
      try {
        translated.push(await translateCase(evalCase, client, { assistantChars: Number(values["assistant-chars"] ?? 400) }));
        await writeJson(path, translated);
      } catch (error) {
        console.error(`Skipped ${evalCase.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.error(`Translated ${translated.length}/${cases.length}`);
    }
    console.log(`Saved ${translated.length} cases. Spot-check a sample by hand before use.`);
    return;
  }

  if (command === "rejudge") {
    assertLocalOnly(env, ["JUDGE"], allowCloud);
    if (!values.file) throw new Error(USAGE);
    const judge = chatClient(env, "JUDGE");
    for (const file of values.file.split(",")) {
      const saved = await readJson<{ report: Record<string, unknown>; results: CaseResult[] }>(file);
      const { results, changed } = await rejudge(saved.results, judge);
      const report = {
        ...saved.report,
        qa: qaMetrics(results),
        ...(saved.report.qaSystem2 ? { qaSystem2: qaMetrics(results, "system2") } : {}),
        rejudged: { judge: env.EVAL_JUDGE_MODEL, changed },
      };
      await writeJson(file, { report, results });
      const qa = report.qa.overall;
      console.log(`${file}: ${changed} grades changed; QA ${qa.correct}/${qa.total}`);
    }
    return;
  }

  if (command === "run") {
    const roles: ChatRole[] = ["GATE", "EXTRACT", "RECONCILE", "ANSWER", "JUDGE", ...(values.system2 || values["system2-compare"] ? (["INDUCE"] as const) : [])];
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
          ...(values["per-type"] ? { perType: Number(values["per-type"]) } : {}),
          ...(values.distractors ? { distractorSessions: Number(values.distractors) } : {}),
        });
        break;
      case "longmemeval-nl":
        cases = (await readJson<EvalCase[]>(join(DATA, "longmemeval-nl.json"))).slice(0, limit);
        break;
      case "locomo":
        cases = parseLoCoMo(await readJson(await cached(LOCOMO_URL, "locomo10.json")), limit ? { limit } : {});
        break;
      case "personamem": {
        const rows = selectPersonaMemRows(
          parseCsv(await readFile(await cached(PERSONAMEM_BENCHMARK_URL, "personamem/benchmark.csv"), "utf8")),
          Number(values.personas ?? 4),
        );
        const histories = new Map<string, PersonaMemHistory>();
        for (const link of new Set(rows.map((row) => row.chat_history_32k_link!))) {
          histories.set(link, await readJson(await cached(`${PERSONAMEM_FILE_URL}${link}`, `personamem/${link.split("/").at(-1)}`)));
        }
        cases = parsePersonaMem(rows, (link) => histories.get(link), { seed }).slice(0, limit);
        break;
      }
      default:
        throw new Error(USAGE);
    }
    const { roles: evalRoles, stats } = rolesFromEnv(env);
    const system2 = values["system2-compare"] ? ("compare" as const) : values.system2 === true;
    const slots: (CaseResult | undefined)[] = new Array(cases.length);
    const failed: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < cases.length) {
        const index = next++;
        const evalCase = cases[index]!;
        let result: CaseResult;
        try {
          result = await runCase(evalCase, evalRoles, {
            ...(system2 ? { system2 } : {}),
            ...(values["no-recall"] ? { recall: false } : {}),
            ...(values["no-memory"] ? { ingest: false } : {}),
            ...(values["min-cluster"] ? { minClusterSize: Number(values["min-cluster"]) } : {}),
            ...(values.threshold ? { gateThreshold: Number(values.threshold) } : {}),
          });
        } catch (error) {
          failed.push(evalCase.id);
          console.error(`${evalCase.id}: failed (${error instanceof Error ? error.message : String(error)})`);
          continue;
        }
        slots[index] = result;
        const score = (questions: CaseResult["questions"]) =>
          `${questions.filter((question) => question.correct).length}/${questions.length}`;
        console.error(
          `${evalCase.id}: ${score(result.questions)} correct${result.questionsSystem2 ? `, ${score(result.questionsSystem2)} after System 2` : ""}, ${result.items} items`,
        );
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency ?? 1)) }, worker));
    const results = slots.filter((result): result is CaseResult => result !== undefined);
    const byId = new Map(cases.map((evalCase) => [evalCase.id, evalCase.events]));
    const report = {
      label: values.label ?? values.set,
      set: values.set,
      cases: results.length,
      failed,
      system2,
      recall: !values["no-recall"] && !values["no-memory"],
      memory: !values["no-memory"],
      models: Object.fromEntries(
        ["EMBED", ...roles].map((role) => [role.toLowerCase(), env[`EVAL_${role}_MODEL`] ?? "(fallback)"]),
      ),
      components: cases.some((evalCase) => evalCase.events) ? componentMetrics(results, (id) => byId.get(id)) : undefined,
      qa: qaMetrics(results),
      qaSystem2: system2 === "compare" ? qaMetrics(results, "system2") : undefined,
      roles: roleSummary(stats()),
      induced: results.reduce((sum, result) => sum + (result.consolidation?.added ?? 0) + (result.consolidation?.replaced ?? 0), 0),
      ingestMs: results.reduce((sum, result) => sum + result.ingestMs, 0),
      embedMs: results.reduce((sum, result) => sum + result.embedMs, 0),
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeJson(join(DATA, "results", `${report.label}-${stamp}.json`), { report, results });
    console.log(JSON.stringify(report, null, 2));
    console.log(`QA accuracy: ${percent(report.qa.overall.rate)} (${report.qa.overall.correct}/${report.qa.overall.total})`);
    if (report.qaSystem2) {
      console.log(`After System 2: ${percent(report.qaSystem2.overall.rate)} (${report.qaSystem2.overall.correct}/${report.qaSystem2.overall.total})`);
    }
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
