import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ANNA_SOURCE = {
  repository: "TNO/sodalis-licensed-avatars",
  release: "session-snapshot-2026-11-06",
  file: "anna-eval.glb",
  sha256: "74c509385b095054488ec83b64a8334eb2a2a9425bb34c21adbab4b57ea49518",
};

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`GitHub download failed: ${result.stderr.trim()}. Authenticate gh with an account that has access to ${ANNA_SOURCE.repository}.`);
  }
  return result.stdout;
}

export function verifyGlb(bytes, sha256) {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("Downloaded avatar is not a complete GLB 2.0 file.");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
    throw new Error("Downloaded avatar failed SHA-256 verification.");
  }
}

export function enableAnna(environment) {
  let next = environment;
  for (const [key, value] of [
    ["VITE_SODALIS_EVAL_AVATARS", "1"],
    ["VITE_SODALIS_DEFAULT_AVATAR", "metahuman-anna-eval"],
  ]) {
    const line = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, "gm");
    if (line.test(next)) next = next.replace(line, `${key}=${value}`);
    else next += `${next && !next.endsWith("\n") ? "\n" : ""}${key}=${value}\n`;
  }
  return next;
}

export function installAnna(root, download = (directory) => {
  const repository = JSON.parse(gh(["repo", "view", ANNA_SOURCE.repository, "--json", "isPrivate"]));
  if (!repository.isPrivate) throw new Error("Licensed avatar repository must be private.");
  gh(["release", "download", ANNA_SOURCE.release, "--repo", ANNA_SOURCE.repository,
    "--pattern", ANNA_SOURCE.file, "--dir", directory]);
}) {
  const destination = join(root, "apps/desktop/public/avatars/eval");
  mkdirSync(destination, { recursive: true });
  const temporary = mkdtempSync(join(destination, ".anna-download-"));
  try {
    download(temporary);
    const downloaded = join(temporary, ANNA_SOURCE.file);
    verifyGlb(readFileSync(downloaded), ANNA_SOURCE.sha256);
    renameSync(downloaded, join(destination, ANNA_SOURCE.file));
    const envPath = join(root, "apps/desktop/.env.local");
    writeFileSync(envPath, enableAnna(existsSync(envPath) ? readFileSync(envPath, "utf8") : ""));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("Usage: pnpm avatar:anna");
  installAnna(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  console.log("Anna installed and enabled for local development. Restart the dev server. Licensed assets remain gitignored; do not redistribute them.");
}
