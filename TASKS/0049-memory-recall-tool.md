# 0049 Adding the recall_memory tool

Status: done
Priority: medium
Subsystem: assistant
Depends on: 0047

## Context

Version 1 injects only derived memories. Explicit episodic questions such as
"Wat heb ik je vorige week over Anna verteld?" need on-demand search over L3
summaries and L1 transcripts ([ADR 0005](../docs/adr/0005-long-term-memory.md)).

## Acceptance Criteria

- Expose a `recall_memory(query, time_range?)` tool to the assistant model. It
  searches L3 and, as a fallback, L1 within retention, and returns dated
  excerpts with provenance.
- Respect remote-context minimization: return only the matched excerpts.
- Add tests and extend the 0048 evaluation with explicit-recall questions.

## Agent Notes

- 2026-10-16 Copilot: Added `recall_memory` as a two-pass flow in the AI
  service: the model may answer with a `recall_memory` request (held back from
  the stream), and `MemoryService.recall` searches L3 and falls back to L1
  within retention, returning dated excerpts with provenance only. Tests cover
  recall and the two-pass reply. Remaining: explicit-recall questions in the
  0048 evaluation.
- 2026-10-16 Copilot: Without health consent, transcript recall skips exchanges
  flagged as health and turns not yet processed by the write path (the user
  turn and its assistant reply share a turn ID); retrieval also drops health
  entries from superseded history.
- 2026-10-17 Copilot: The LLM-rendered Dutch evaluation includes six explicit
  recall questions. The model answered 5/6 with the memory block alone and
  5/6 without the `recall_memory` tool; LongMemEval-S assistant-content
  questions score 1/10 because the assistant's own statements are deliberately
  not extracted. The recall tool is implemented and covered by public-interface
  tests. Its instruction was tightened to require the request JSON as the
  entire reply; prose before the JSON remains an open robustness issue in the
  [evaluation](../docs/evaluations/memory.md). Closed: acceptance criteria met.
