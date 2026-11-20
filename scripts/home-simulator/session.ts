import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { callHomeSimulator, connectHomeSimulator, type HomeSimulatorConnection } from "./client.js";

export const DEFAULT_HANDOFF_PATH = resolve(import.meta.dirname, "../../logs/home-simulator/session.json");

export interface SessionHandoff {
  readonly root: string;
  readonly stateDir: string;
  readonly sessionId: string;
  readonly datasetId: string;
  readonly scenario: string;
}

export function readSessionHandoff(path = DEFAULT_HANDOFF_PATH): SessionHandoff {
  const value = JSON.parse(readFileSync(path, "utf8"));
  for (const key of ["root", "stateDir", "sessionId", "datasetId", "scenario"] as const) {
    if (typeof value?.[key] !== "string" || !value[key].trim()) {
      throw new Error(`Invalid Home Simulator session handoff ${path}: missing ${key}. Run pnpm home-simulator:session.`);
    }
  }
  if (!isAbsolute(value.root) || !isAbsolute(value.stateDir)) throw new Error(`Invalid Home Simulator handoff paths in ${path}.`);
  return value;
}

export interface ReplaySessionOptions extends Pick<HomeSimulatorConnection, "root" | "stateDir" | "launch"> {
  readonly scenario?: string;
  readonly handoffPath?: string;
  readonly pollIntervalMs?: number;
}

export async function createReplaySession(options: ReplaySessionOptions): Promise<SessionHandoff> {
  const root = resolve(options.root);
  const stateDir = options.stateDir ?? join(root, "output", "tool-service");
  const scenario = options.scenario ?? "avatar-support";
  const coordinator = await connectHomeSimulator({ ...options, root, stateDir, role: "coordinator" });
  try {
    const list = await callHomeSimulator(coordinator, "list_datasets");
    const datasets = list.result as { dataset_id: string; metadata: { plan: string } }[];
    let datasetId = datasets.filter((entry) => entry.metadata.plan === scenario)
      .map((entry) => entry.dataset_id).sort()[0];
    if (!datasetId) {
      const generated = await callHomeSimulator(coordinator, "generate_dataset", { scenario_id: scenario });
      if (typeof generated.id !== "string") throw new Error("Home Simulator returned no generation job ID.");
      while (true) {
        const job = await callHomeSimulator(coordinator, "get_job", { job_id: generated.id });
        if (job.status === "completed") {
          const result = job.result as { dataset_id?: string } | undefined;
          if (!result?.dataset_id) throw new Error(`Home Simulator job ${generated.id} completed without a dataset ID.`);
          datasetId = result.dataset_id;
          break;
        }
        if (!["queued", "running", "cancelling"].includes(String(job.status))) {
          throw new Error(`Home Simulator dataset job ${generated.id} ${String(job.status)}: ${String(job.error ?? "generation did not complete")}`);
        }
        await sleep(options.pollIntervalMs ?? 2_000);
      }
    }
    const session = await callHomeSimulator(coordinator, "open_session", { dataset_id: datasetId });
    if (typeof session.session_id !== "string" || !session.session_id) throw new Error("Home Simulator returned no session ID.");
    const handoff = { root, stateDir, scenario, datasetId, sessionId: session.session_id };
    const path = options.handoffPath ?? DEFAULT_HANDOFF_PATH;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.next`, `${JSON.stringify(handoff, null, 2)}\n`, { mode: 0o600 });
    renameSync(`${path}.next`, path);
    return handoff;
  } finally {
    await coordinator.close();
  }
}
