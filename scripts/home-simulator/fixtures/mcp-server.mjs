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
