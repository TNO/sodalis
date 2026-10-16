# 0048 Evaluating long-term memory

Status: open
Priority: high
Subsystem: assistant
Depends on: 0045, 0046, 0047

## Context

[ADR 0005](../docs/adr/0005-long-term-memory.md) requires component and
end-to-end evaluation in Dutch and English. No public Dutch or companion-domain
memory benchmark exists, so the Dutch data must be generated rather than
written by hand.

## Acceptance Criteria

- Add an evaluation harness in `packages/memory/eval`. It drives the memory
  package's public ingest and answer interfaces, and the model roles are
  configurable.
- Generate a Dutch synthetic set with a seeded, reproducible script:
  - Sample elderly Flemish personas from `nvidia/Nemotron-Personas-Belgium`
    (`nl_BE`, CC-BY-4.0, with attribution) by filtering on age.
  - Build a seeded event graph for each persona as the ground truth. It covers
    family, appointments and dates, changing preferences, corrections, health
    facts, transient states, and distractors.
  - Have an LLM render multi-session Dutch dialogues from the graph.
  - Derive the gate, extraction, reconciliation, and QA labels from the graph,
    not from the LLM.
  - Have an LLM judge verify that each planted fact appears in the dialogue,
    and regenerate any session that fails.
  - The rendering model must differ from the extraction model under test.
- Report the following metrics:
  - component metrics: gate precision and recall, extraction F1, and
    reconciliation-action accuracy
  - end-to-end QA on LongMemEval-S (including the knowledge-update and
    temporal subsets) and LoCoMo
  - a machine-translated Dutch subset of LongMemEval-S of about 100 questions,
    with spot checks
  - latency and token use for each role
- Compare the extraction candidates (Qwen3.8-27B, Qwen3.6-35B-A3B,
  Gemma-4-26B-A4B, gpt-oss-20b, and Azure as a ceiling), the gate candidates,
  and the embedding candidates (Qwen3-Embedding-0.6B at 512 dimensions versus
  granite-embedding-311m-multilingual-r2).
- Optionally, run Hy-Memory as a Python baseline on the same data. It is never
  shipped.
- Write the consolidated analysis in `docs/evaluations/memory.md` following
  its README, and add it to the index.

## Implementation Notes

- Keep downloaded datasets, generated dialogues, and raw metrics in ignored
  folders. Commit only the generator, seeds, and small fixtures.
- Check the LoCoMo data license before redistributing any part of it.
- Follow the cloud-consent rule in AGENTS.md for Azure rendering or
  extraction runs.

## Agent Notes
