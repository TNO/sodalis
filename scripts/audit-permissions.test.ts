import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const image = "node:24-bookworm-slim";
const available = !process.env.CI &&
  spawnSync("docker", ["image", "inspect", image], { stdio: "ignore", timeout: 5_000 }).status === 0;
const root = resolve(import.meta.dirname, "..");

describe.skipIf(!available)("audit ownership across the container boundary", () => {
  it("lets the host developer open private logs written by a root container after it exits", () => {
    const directory = mkdtempSync(join(tmpdir(), "sodalis-audit-permissions-"));
    try {
      const result = spawnSync("docker", [
        "run", "--rm", "--pull", "never", "--network", "none",
        "--mount", `type=bind,source=${join(root, "apps/server/src/assistant/harness/audit.ts")},target=/audit.ts,readonly`,
        "--mount", `type=bind,source=${directory},target=/logs`,
        image, "node", "--experimental-strip-types", "--input-type=module", "-e",
        'import { FileCompanionAuditWriter } from "/audit.ts";' +
        'const writer = new FileCompanionAuditWriter("/logs");' +
        'await writer.write({event:"user.message",workflowId:"w",sessionId:"s",correlationId:"w",' +
        'timestamp:"2026-11-05T00:00:00Z",text:"local permission fixture"});',
      ], { encoding: "utf8", timeout: 30_000 });
      expect(result.status, result.stderr).toBe(0);
      const files = readdirSync(directory);
      expect(files).toHaveLength(2);
      const owner = statSync(directory);
      for (const file of files) {
        const path = join(directory, file);
        expect(statSync(path).uid).toBe(owner.uid);
        expect(statSync(path).gid).toBe(owner.gid);
        expect(statSync(path).mode & 0o777).toBe(0o600);
        expect(readFileSync(path, "utf8")).toContain("local permission fixture");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 35_000);
});
