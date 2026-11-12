import { describe, expect, it } from "vitest";
import { parseCompanionAuditJsonl, renderCompanionAuditHtml } from "./auditReport.js";

describe("offline companion audit report", () => {
  it("reconstructs interleaved workflows and clearly marks legacy data as unavailable", () => {
    const parsed = parseCompanionAuditJsonl([
      JSON.stringify({
        event: "workflow.terminal",
        workflowId: "workflow-a",
        sessionId: "session-a",
        timestamp: "2026-11-11T10:00:03.000Z",
        outcome: "answer",
        residentAnswer: "The bedroom is warm.",
      }),
      JSON.stringify({
        event: "user.message",
        workflowId: "workflow-b",
        sessionId: "session-b",
        timestamp: "2026-11-11T10:00:01.000Z",
        text: "Good morning.",
      }),
      JSON.stringify({
        event: "user.message",
        workflowId: "workflow-a",
        sessionId: "session-a",
        timestamp: "2026-11-11T10:00:02.000Z",
        text: "What is the bedroom temperature?",
      }),
      JSON.stringify({
        event: "assistant.message",
        workflowId: "workflow-b",
        sessionId: "session-b",
        timestamp: "2026-11-11T10:00:04.000Z",
        text: "Good morning!",
        usage: { totalTokens: "[REDACTED]" },
      }),
    ].join("\n"));
    const html = renderCompanionAuditHtml(parsed.events, parsed.warnings);

    expect(html).toContain("workflow-a");
    expect(html).toContain("workflow-b");
    expect(html).toContain("What is the bedroom temperature?");
    expect(html).toContain("The bedroom is warm.");
    expect(html).toContain("Good morning!");
    expect(html).toContain("no request-context records");
    expect(html).toContain("legacy usage is unavailable or redacted");
    expect(html).toContain("incomplete");
  });

  it("warns about a truncated final record and rejects other malformed lines", () => {
    const complete = JSON.stringify({
      event: "workflow.started",
      workflowId: "workflow-partial",
      sessionId: "session-partial",
      timestamp: "2026-11-11T10:00:00.000Z",
    });
    const partial = parseCompanionAuditJsonl(`${complete}\n{"event":"user.message","text":"unfinished`);
    expect(partial.events).toHaveLength(1);
    expect(partial.warnings).toEqual([expect.stringContaining("line 2")]);
    expect(() => parseCompanionAuditJsonl(`${complete}\nnot-json\n`)).toThrow(/line 2/i);
  });

  it("shows provider-reported usage counts in the report", () => {
    const parsed = parseCompanionAuditJsonl(`${JSON.stringify({
      event: "assistant.message",
      workflowId: "workflow-usage",
      sessionId: "session-usage",
      timestamp: "2026-11-11T10:00:00.000Z",
      usageSource: "provider_reported",
      usage: { input: 110, output: 30, cacheRead: 8, cacheWrite: 2, totalTokens: 150 },
    })}\n`);
    const html = renderCompanionAuditHtml(parsed.events, parsed.warnings);

    expect(html).toContain("provider-reported usage");
    expect(html).toContain("&quot;totalTokens&quot;:150");
  });

  it("renders adversarial audit values as inert text in a self-contained document", () => {
    const html = renderCompanionAuditHtml([{
      event: "user.message",
      workflowId: "workflow-xss",
      sessionId: "session-xss",
      timestamp: "2026-11-11T10:00:00.000Z",
      text: `<script>alert("x")</script><img src="https://invalid.example/x" onerror="alert(1)">`,
    }], []);

    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=&quot;https://invalid.example/x&quot;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script\b|<img\b|<iframe\b/i);
  });
});
