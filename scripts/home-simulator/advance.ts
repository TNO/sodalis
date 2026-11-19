import { callHomeSimulator, connectHomeSimulator, type HomeSimulatorConnection } from "./client.js";
import { DEFAULT_HANDOFF_PATH, readSessionHandoff, type SessionHandoff } from "./session.js";

export interface AdvanceOptions extends Pick<HomeSimulatorConnection, "launch"> {
  readonly handoffPath?: string;
}

export interface AdvanceResult {
  readonly status: "advanced" | "ended";
  readonly batchId?: string;
  readonly eventCount: number;
  readonly simulationTime: string;
  readonly nextInteraction?: { readonly timestamp: string; readonly person: string };
}

function loadHandoff(path: string): SessionHandoff {
  try {
    return readSessionHandoff(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No Home Simulator session handoff at ${path}. Start the stack with the Home Simulator flag on (HOME_PROVIDER=simulator) or run pnpm home-simulator:session.`);
    }
    throw error;
  }
}

/** Advances the replay to the next avatar interaction; operator-only, never exposed through the bridge. */
export async function advanceReplay(options: AdvanceOptions = {}): Promise<AdvanceResult> {
  const handoff = loadHandoff(options.handoffPath ?? DEFAULT_HANDOFF_PATH);
  let client;
  try {
    client = await connectHomeSimulator({ root: handoff.root, stateDir: handoff.stateDir, role: "avatar",
      sessionId: handoff.sessionId, launch: options.launch });
  } catch (error) {
    throw new Error(`Cannot attach to Home Simulator replay session ${handoff.sessionId}; it may be unknown. Run pnpm home-simulator:session. ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    // A pending batch is re-returned from page 1, so a retry never skips observations.
    let page = await callHomeSimulator(client, "next_interaction_batch");
    if (page.end_of_dataset === true && typeof page.batch_id !== "string") {
      return { status: "ended", eventCount: 0, simulationTime: String(page.simulation_time) };
    }
    const batchId = String(page.batch_id);
    let eventCount = 0;
    while (true) {
      eventCount += Array.isArray(page.events) ? page.events.length : 0;
      if (page.window_complete === true) break;
      if (typeof page.next_page_token !== "string" || !page.next_page_token) {
        throw new Error(`Home Simulator batch ${batchId} has more pages but returned no page token.`);
      }
      page = await callHomeSimulator(client, "next_interaction_batch", { page_token: page.next_page_token });
    }
    // Context checkpoint only: nothing is stored durably.
    await callHomeSimulator(client, "acknowledge_batch", {
      batch_id: batchId, memory_checkpoint_id: `sodalis-advance-${batchId}`, memory_kind: "context",
    });
    const simulationTime = String(page.simulation_time);
    const next = page.next_interaction as { timestamp?: unknown; person?: unknown } | null | undefined;
    if (page.end_of_dataset === true || page.reason === "end_of_dataset") {
      return { status: "ended", batchId, eventCount, simulationTime };
    }
    return { status: "advanced", batchId, eventCount, simulationTime,
      ...(next ? { nextInteraction: { timestamp: String(next.timestamp), person: String(next.person) } } : {}) };
  } finally {
    await client.close();
  }
}

export function describeAdvance(result: AdvanceResult): string {
  if (result.status === "ended") {
    return `Dataset ended, nothing left to replay (simulated time ${result.simulationTime}).`;
  }
  const next = result.nextInteraction
    ? `Next interaction: ${result.nextInteraction.timestamp} with ${result.nextInteraction.person}.`
    : "No further interaction in this window.";
  return `Simulated time is now ${result.simulationTime} (${result.eventCount} events observed). ${next}`;
}
