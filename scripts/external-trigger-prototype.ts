import { spawn } from "node:child_process";
import process from "node:process";

const sharedEnvironment = { ...process.env };
const api = spawn(
  "pnpm",
  ["--filter", "@sodalis/server", "run", "prototype:external-trigger-api"],
  {
    cwd: process.cwd(),
    env: { ...sharedEnvironment, HOST: "127.0.0.1", PORT: "3013" },
    stdio: "inherit",
  },
);
const ui = spawn(
  "pnpm",
  ["--filter", "@sodalis/desktop", "run", "prototype:external-trigger-ui"],
  {
    cwd: process.cwd(),
    env: { ...sharedEnvironment, EXTERNAL_TRIGGER_API_URL: "http://127.0.0.1:3013" },
    stdio: "inherit",
  },
);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of [api, ui]) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
};

api.on("error", (error) => {
  console.error("Could not start the prototype API:", error);
  stop();
});
api.on("exit", (code, signal) => {
  if (!stopping) {
    console.log(
      `[external-trigger] API stopped (${signal ?? `exit ${code}`}); UI remains available for a manual restart.`,
    );
  }
});
ui.on("error", (error) => {
  console.error("Could not start the prototype UI:", error);
  stop();
});
ui.on("exit", (code, signal) => {
  if (!stopping) {
    console.log(`[external-trigger] UI stopped (${signal ?? `exit ${code}`}).`);
    stop();
  }
});

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("External-trigger prototype: http://127.0.0.1:4177/external-trigger-prototype.html");
console.log("API is loopback-only on http://127.0.0.1:3013; Ctrl+C stops both processes.");
