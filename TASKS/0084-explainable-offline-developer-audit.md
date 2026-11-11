# 0084 Make the developer audit explainable and readable offline

Status: open
Triage: ready-for-agent
Priority: high
Subsystem: assistant
Depends on: 0068 (done)

## What to build

Let a developer follow a workflow's model-visible information, selected tools,
host decisions, and token usage in a standalone offline HTML report, without
reading raw JSONL or changing model behavior. Keep the existing JSONL and text
outputs. This is one end-to-end implementation task, not a resident-facing
progress or evidence feature.

## Context

The existing developer audit records tool selection, dispatch, and results,
but does not capture the effective prompt and offered tool definitions needed
to understand the model's available information. Its text transcript is
chronological but uses dense single-line records.

A local synthetic reproduction through the actual audit writer confirmed that
numeric `usage.totalTokens` becomes `[REDACTED]`: credential filtering matches
any key containing "token". Input and output counts remain numeric. The
user's pasted log was not accessible; this finding is independently reproduced,
not a claim about inspecting that attachment.

The current model adapter uses a chat-completions interface. Reasoning
configuration alone does not establish that a safe reasoning summary is
available. Observable decision context explains what information was available
and what happened; it does not reveal private chain-of-thought, prove why a
tool was selected, or enumerate internally considered alternatives.

## Acceptance Criteria

### Usage and credential redaction

- [ ] Preserve valid numeric input, output, cache, and total token counts in
  known host-owned model-usage telemetry, in JSONL, text, and HTML. Identify
  provider-reported usage separately from missing or synthetic history usage;
  do not turn unavailable counts into zero or misleading workflow totals.
- [ ] Scope the exception to recognized numeric usage fields, not every key
  containing "token" or every numeric value. Credential keys, nested secret
  containers, bearer tokens, and inline credentials remain redacted. A
  credential-shaped string in a usage field must not bypass sanitization.
- [ ] Do not claim to recover previously redacted totals. Historical logs
  retain an explicit redacted/unavailable state.

### Observable tool-selection evidence

- [ ] Capture the effective system prompt, offered tool names/descriptions/
  argument schemas, model identity and existing reasoning settings, and ordered
  model-visible history, accepted steering input, and prior tool results for
  each model request. Inspect the supported SDK request boundary so SDK-added
  context is included; do not substitute the source prompt constant for the
  effective input or claim an exact provider-wire capture without evidence.
- [ ] Correlate each request, response, selected tool call, dispatch, result,
  host validation/budget decision, and terminal outcome by workflow, model
  turn/request, and tool-call identity. Show selection separately from
  permission to execute. Support multiple calls per turn and workflows that
  answer without tools.
- [ ] An initial context record plus ordered changes/references is acceptable
  if it reconstructs the input to each request unambiguously. Label omitted,
  redacted, or inaccessible information explicitly rather than inventing it.
  Keep model narration separate from host decisions and resident answers.
- [ ] Include a reasoning summary only when the configured provider and SDK
  explicitly expose a supported summary distinct from opaque thinking or
  private reasoning. Label its source and treat it as a model explanation,
  not proof of internal causation. Otherwise record an explicit unavailable
  status and reason. Never dump raw thinking blocks or reasoning signatures.
- [ ] Do not add inference calls, enable thinking, change reasoning effort,
  switch provider APIs, or ask the model for explanations solely for logging.
  Audit enablement must not change prompts, tools, answers, or execution policy.

### On-demand offline HTML report

- [ ] Provide a documented local command that reads a selected JSONL audit and
  writes a standalone HTML file. No running stack, model call, credentials,
  diagnostic HTTP server, network connection, or external assets are required.
- [ ] Group records by session/workflow and show a chronological timeline with
  expandable model turns and correlated tool calls. Make the question, terminal
  outcome, durations, available token usage, decision context, selected
  arguments, host decisions, and results easy to locate. Retain access to the
  sanitized underlying event details.
- [ ] Render older logs without the new context records, incomplete workflows,
  and interleaved workflows honestly. A truncated final JSONL record produces
  a visible partial-log warning; other malformed records produce a clear
  line-numbered error, not silent omission or success-shaped output.
- [ ] Treat every log value as untrusted display data, never executable HTML,
  script, or an automatically fetched resource. Apply shared sanitization to
  report inputs as defense in depth, including legacy files. Keep generated
  reports private, git-ignored, and inside the local audit storage boundary;
  report read/write failures explicitly.

### Boundaries, tests, and documentation

- [ ] Preserve the existing opt-in and production guard, text-only speech
  capture, file ownership/private permissions, container persistence, and
  ordinary audit-write error reporting. Keep raw records and reports out of
  resident UI/HTTP/SSE, external uploads, and durable assistant memory.
- [ ] Preserve existing content exclusions, including personal-account content.
  More context capture does not authorize new capabilities, imported-app/DOM
  access, credentials, audio, or recording artifacts. Developers manually
  delete logs and reports; add no retention service or quota manager.
- [ ] Add deterministic behavior tests at the audit/workflow and report-command
  interfaces. Cover numeric usage versus nested/inline secrets, a multi-turn
  tool journey and steering context, no-tool answers, available/unsupported
  summaries with private thinking excluded, legacy/interleaved/incomplete and
  malformed logs, and adversarial HTML/script content remaining inert.
- [ ] Verify with local mocks that enabling the audit leaves model inputs,
  workflow behavior, resident transport, and memory boundaries unchanged.
  Demonstrate the token-count regression failing before the fix and passing
  afterward, with the original synthetic writer scenario also passing.
- [ ] Update the server guide and current architecture with the capture
  contract, report command, summary limitations, unavailable historical data,
  and manual deletion responsibility. Use synthetic examples only.
- [ ] Run `pnpm test`, `pnpm typecheck`, and `pnpm build` for implementation.
  No live/cloud check is necessary; any later cloud run requires separate
  explicit consent and provider-selection checks.

## Implementation Plan

1. Establish focused failing behavior tests for numeric usage and missing
   decision context. Verify the SDK's supported input/summary seams before
   choosing the capture mechanism; do not broaden SDK event dumps.
2. Narrow redaction exceptions and add correlated, sanitized decision-context
   records using existing audit boundaries. Keep inference unchanged.
3. Generate the offline HTML report from the sanitized event stream, with
   legacy/partial-log handling and inert rendering; verify the public command
   and drill-down behavior with deterministic fixtures.
4. Update usage/architecture documentation and run the required workspace
   gates. Demonstrate one synthetic workflow from capture through report.

## Blocked by

None outstanding. Task 0068 is complete; no resident-progress, memory,
calendar/email integration, harness-convergence, or latency task gates this work.
