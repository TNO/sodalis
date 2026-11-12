import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { writeCompanionAuditReport } from "./companion-audit-report.js";

describe("offline audit report command", () => {
  it("writes a private standalone report inside logs and sanitizes legacy input", async () => {
    const directory = resolve(import.meta.dirname, "../logs");
    const id = randomUUID();
    const input = resolve(directory, `companion-audit-report-test-${id}.jsonl`);
    const output = resolve(directory, `companion-audit-report-test-${id}.html`);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(input, `${JSON.stringify({
        event: "user.message",
        sessionId: "session-demo",
        workflowId: "workflow-demo",
        timestamp: "2026-11-11T10:00:00.000Z",
        text: `<img src=x onerror=alert(1)> api_key=offline-secret`,
      })}\n`, { mode: 0o600 });

      expect(await writeCompanionAuditReport(input, output)).toBe(output);
      const html = await readFile(output, "utf8");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(html).not.toContain("offline-secret");
      expect(html).not.toMatch(/<script\b|<img\b|https?:\/\//i);
      expect((await stat(output)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(input, { force: true });
      await rm(output, { force: true });
    }
  });

  it("rejects malformed logs and paths outside the local audit directory", async () => {
    const directory = resolve(import.meta.dirname, "../logs");
    const id = randomUUID();
    const input = resolve(directory, `companion-audit-report-bad-${id}.jsonl`);
    const output = resolve(directory, `companion-audit-report-bad-${id}.html`);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(input, '{"event":"ok"}\nnot-json\n', { mode: 0o600 });
      await expect(writeCompanionAuditReport(input, output)).rejects.toThrow(/line 2/i);
      await expect(writeCompanionAuditReport(resolve(directory, "../outside.jsonl"), output))
        .rejects.toThrow(/inside the local logs directory/i);
    } finally {
      await rm(input, { force: true });
      await rm(output, { force: true });
    }
  });
});
