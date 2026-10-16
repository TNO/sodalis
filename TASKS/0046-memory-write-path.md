# 0046 Building the memory write path

Status: open
Priority: high
Subsystem: assistant
Depends on: 0045

## Context

[ADR 0005](../docs/adr/0005-long-term-memory.md) defines a continuous write
path. Every turn is stored. A fast local gate decides whether a user turn is
worth analysing. An extraction LLM then produces L2, L3, and L4 items, and a
reconciliation step decides ADD, UPDATE, SUPERSEDE, or NOOP. All of this runs
asynchronously after the reply.

## Acceptance Criteria

- Store every user and assistant turn as L1 before any model call.
- Define a `DecisionGate` port whose request and response use the
  `/v1/systemone` shape (`state`, `questions`, per-option probabilities). It
  asks:
  - `memory_worthy` (yes or no)
  - `kind`: one of `fact`, `preference`, `person`, `date_event`, `health`,
    `correction`, or `none`
  - `is_correction` (yes or no)
- Implement the gate with a local small LLM reached through an
  OpenAI-compatible endpoint (`MEMORY_GATE_*`), reading option-letter
  log-probabilities. The recall-oriented threshold is configurable. There is no
  cloud gate.
- The gate and the extractor see only the user turn plus the preceding
  assistant turn. Facts are never extracted from assistant text alone.
- Implement extraction through `MEMORY_EXTRACT_*` (OpenAI-compatible; Azure
  supported) with JSON-schema output. Field names are English and values stay
  in the source language. Each item carries a layer, subject, `event_at`, a
  sensitivity, a provenance, and a `transient` flag; transient items go to L3.
- Implement reconciliation as one batched call per turn over the 5 nearest
  active items on the same subject. Apply ADD, UPDATE (with a revision),
  SUPERSEDE (with `valid_to` and links), or NOOP.
- Drop health items unless health consent has been recorded. Never store
  credentials; detect and discard them before extraction.
- Run the pipeline in a durable, in-process queue that survives a restart. A
  failure never loses an L1 turn.
- Add tests with mocked gate and extraction providers for each reconciliation
  action, the transient routing, health-consent gating, credential discarding,
  and restart recovery.

## Implementation Notes

- Adapt the extraction and reconciliation prompts from Hy-Memory's
  `pipelines/writer.py` (Apache-2.0) and record their origin.
- Defaults: extraction uses Qwen3.8-27B. The gate uses a Qwen3.5-2B-class model
  or `Mapika/decider-2b`; check its Dutch accuracy in 0048. A Lattice
  `/v1/systemone` adapter can follow once Lattice ships it.
- Before running against Azure, follow the cloud-consent rule in AGENTS.md.

## Agent Notes
