import { chmod, lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCompanionAuditJsonl, renderCompanionAuditHtml } from "../apps/server/src/assistant/harness/auditReport.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logsDirectory = resolve(repositoryRoot, "logs");

function isDirectChild(directory: string, file: string): boolean {
  return dirname(file) === directory;
}

function resolveArgumentPath(path: string): string {
  return resolve(process.cwd(), path);
}

async function ensureLogsDirectory(): Promise<string> {
  await mkdir(logsDirectory, { recursive: true, mode: 0o700 });
  return realpath(logsDirectory);
}

export async function writeCompanionAuditReport(inputPath: string, outputPath?: string): Promise<string> {
  const logs = await ensureLogsDirectory();
  const requestedInput = resolveArgumentPath(inputPath);
  if (!isDirectChild(logs, requestedInput) || extname(requestedInput).toLowerCase() !== ".jsonl") {
    throw new Error("The selected JSONL audit must be inside the local logs directory.");
  }
  let input: string;
  try {
    const inputEntry = await lstat(requestedInput);
    if (inputEntry.isSymbolicLink() || !inputEntry.isFile()) {
      throw new Error("input must be a regular JSONL file, not a symlink");
    }
    input = await realpath(requestedInput);
  } catch (error) {
    if (error instanceof Error && error.message.includes("regular JSONL")) throw error;
    throw new Error(`Could not read the selected audit file: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isDirectChild(logs, input) || extname(input).toLowerCase() !== ".jsonl") {
    throw new Error("The selected JSONL audit must be inside the local logs directory.");
  }

  const defaultOutput = resolve(logs, `${input.slice(dirname(input).length + 1, -".jsonl".length)}.html`);
  const requestedOutput = outputPath ? resolveArgumentPath(outputPath) : defaultOutput;
  if (extname(requestedOutput).toLowerCase() !== ".html") {
    throw new Error("The report output path must use the .html extension.");
  }
  let outputDirectory: string;
  try {
    outputDirectory = await realpath(dirname(requestedOutput));
  } catch (error) {
    throw new Error(`Could not access the report output directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (outputDirectory !== logs || !isDirectChild(logs, requestedOutput)) {
    throw new Error("The report output must be inside the local logs directory.");
  }
  try {
    const existing = await lstat(requestedOutput);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("the report output must be a regular file, not a symlink");
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw new Error(`Could not use the report output path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let source: string;
  try {
    const inputStat = await stat(input);
    if (!inputStat.isFile()) throw new Error("selected audit is not a regular file");
    source = await readFile(input, "utf8");
  } catch (error) {
    throw new Error(`Could not read the selected audit file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = parseCompanionAuditJsonl(source);
  const html = renderCompanionAuditHtml(parsed.events, parsed.warnings);
  try {
    await writeFile(requestedOutput, html, { encoding: "utf8", mode: 0o600 });
    await chmod(requestedOutput, 0o600);
    const outputStat = await stat(requestedOutput);
    if ((outputStat.mode & 0o077) !== 0) throw new Error("report permissions are not private");
  } catch (error) {
    throw new Error(`Could not write a private report in the local logs directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  return requestedOutput;
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length < 1 || args.length > 2 || args.some((argument) => !argument.trim())) {
    throw new Error("Usage: pnpm audit:report <logs/audit.jsonl> [logs/report.html]");
  }
  const output = await writeCompanionAuditReport(args[0]!, args[1]);
  console.log(`Offline audit report written: ${output}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (isAbsolute(invokedPath) && invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`Audit report failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
