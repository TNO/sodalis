import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
const role = argument("--role");
const stateDir = argument("--state-dir");
const sessionId = argument("--session-id");
mkdirSync(stateDir, { recursive: true });
const file = resolve(stateDir, "fixture.json");
const read = () => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const save = (state) => writeFileSync(file, JSON.stringify(state));
if (role === "avatar" && !read().sessions?.[sessionId]) process.exit(2);

// Batches come from `batchScript` in fixture.json: [{ events, pages, time, reason?, interaction? }].
function nextBatch(state, args) {
  const session = state.sessions[sessionId];
  const script = state.batchScript ?? [];
  session.cursor ??= 0;
  if (!session.pending) {
    if (args.page_token) throw new Error("Page token does not belong to a pending batch.");
    if (session.cursor >= script.length) {
      return { session_id: sessionId, end_of_dataset: true, simulation_time: session.simulation_time };
    }
    session.pending = { batch_id: `batch-${session.cursor + 1}`, pagesRead: 0 };
  }
  const batch = script[session.cursor];
  const pending = session.pending;
  const match = args.page_token === undefined ? undefined : /^(.+):(\d+)$/.exec(args.page_token);
  const page = args.page_token === undefined ? 1 : Number(match?.[2]);
  if (args.page_token !== undefined && (match?.[1] !== pending.batch_id || page < 2 || page > batch.pages)) {
    throw new Error("Invalid page token for this session/batch.");
  }
  // A retry from page 1 restarts the read; later pages must follow in order.
  if (page !== 1 && page !== pending.pagesRead + 1) throw new Error("Invalid page token for this session/batch.");
  pending.pagesRead = page;
  const size = Math.ceil(batch.events / batch.pages);
  const events = Array.from({ length: batch.events }, (_, index) => ({ event_id: `${pending.batch_id}-event-${index + 1}` }))
    .slice((page - 1) * size, page * size);
  const complete = page === batch.pages;
  if (complete) session.simulation_time = batch.time;
  const ended = batch.reason === "end_of_dataset";
  return { session_id: sessionId, batch_id: pending.batch_id, events, window_complete: complete,
    page_complete: true, simulation_time: session.simulation_time,
    next_interaction: complete && !ended ? { timestamp: batch.time, person: batch.person ?? "jo", ...batch.interaction } : null,
    next_page_token: complete ? null : `${pending.batch_id}:${page + 1}`,
    requires_acknowledgement: true, reason: batch.reason ?? "interaction", end_of_dataset: ended };
}

function acknowledge(state, args) {
  const session = state.sessions[sessionId];
  const script = state.batchScript ?? [];
  session.acknowledged ??= {};
  const receipt = { session_id: sessionId, batch_id: args.batch_id,
    memory_checkpoint_id: args.memory_checkpoint_id, memory_kind: args.memory_kind, acknowledged: true };
  const previous = session.acknowledged[args.batch_id];
  if (previous !== undefined) {
    if (previous !== args.memory_checkpoint_id) throw new Error("Batch was already acknowledged with a different checkpoint.");
    return receipt;
  }
  if (session.pending?.batch_id !== args.batch_id) throw new Error("Unknown pending batch.");
  if (session.pending.pagesRead < script[session.cursor].pages) throw new Error("Read all pages before acknowledging this batch.");
  if (state.ackFailures > 0) {
    state.ackFailures--;
    throw new Error("Fixture acknowledgement failed");
  }
  session.acknowledged[args.batch_id] = args.memory_checkpoint_id;
  session.pending = null;
  session.cursor++;
  return receipt;
}

function tool(name, args) {
  const state = read();
  state.calls ??= [];
  state.calls.push({ role, name, arguments: args });
  save(state);
  if (role === "coordinator") {
    if (name === "list_datasets") return { result: state.datasets ?? [] };
    if (name === "generate_dataset") {
      const job = { id: `job-${randomUUID()}`, status: "queued", scenario: args.scenario_id, polls: 0 };
      state.jobs ??= {};
      state.jobs[job.id] = job;
      save(state);
      return { id: job.id, status: job.status };
    }
    if (name === "get_job") {
      const job = state.jobs?.[args.job_id];
      if (!job) throw new Error("Unknown dataset job.");
      if (job.polls >= 2 && job.status !== "completed") throw new Error("Fixture job was polled past termination.");
      job.polls++;
      job.status = job.polls === 1 ? "running" : (state.jobStatus ?? "completed");
      if (job.status === "completed") {
        const dataset = { dataset_id: `dataset-${job.scenario}`, metadata: { plan: job.scenario } };
        state.datasets ??= [];
        if (!state.datasets.some((item) => item.dataset_id === dataset.dataset_id)) state.datasets.push(dataset);
        job.result = dataset;
      } else if (job.status !== "running") job.error = "Fixture generation stopped";
      save(state);
      return job;
    }
    if (name === "open_session") {
      const id = `session-${randomUUID()}`;
      const session = { session_id: id, dataset_id: args.dataset_id,
        simulation_time: "2025-02-14T22:59:59.999999+00:00" };
      state.sessions ??= {};
      state.sessions[id] = session;
      save(state);
      return session;
    }
  }
  if (role === "avatar") {
    if (args.fixturePid) return { pid: process.pid };
    if (args.fixtureExit) process.exit(0);
    if (name === "query_sensor_data" && args.end && Date.parse(args.end) > Date.parse(state.sessions[sessionId].simulation_time)) {
      throw new Error("Query end cannot exceed the session observation clock.");
    }
    if (name === "next_interaction_batch" || name === "acknowledge_batch") {
      try {
        return name === "acknowledge_batch" ? acknowledge(state, args) : nextBatch(state, args);
      } finally { save(state); }
    }
    if (name === "get_session") return state.sessions[sessionId];
    const clock = state.sessions[sessionId].simulation_time;
    if (name === "query_sensor_data") return { events: [], has_more: false,
      next_after_sequence: args.after_sequence ?? 0, through: clock, clock: "received_at" };
    if (name === "get_context") return { entities: [], has_more: false, next_offset: null, inference: "none" };
    if (name === "query_ontology") return { boolean: true, inference: "none", view: "context" };
    if (name === "query_weather") return { rows: [], has_more: false, next_offset: null,
      withheld_unknown_issue_time: 0, as_of: clock };
    if (name === "get_agenda") return { events: [], has_more: false, next_offset: null,
      availability_basis: "declared_agenda_at_start_of_each_local_day", as_of: clock };
  }
  throw new Error(`Unknown ${role} tool: ${name}`);
}

for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.id === undefined) continue;
  let result;
  if (message.method === "initialize") {
    result = { protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: `fake-${role}`, version: "1" } };
  } else if (message.method === "tools/call") {
    try {
      const value = tool(message.params.name, message.params.arguments ?? {});
      result = { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false };
    } catch (error) {
      result = { content: [{ type: "text", text: error.message }], isError: true };
    }
  } else if (message.method === "tools/list") result = { tools: [] };
  else result = {};
  console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
}
