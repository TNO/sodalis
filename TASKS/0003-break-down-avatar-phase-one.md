# 0003 Breaking Phase 1 into implementation tasks

Status: done
Priority: high
Subsystem: avatar
Depends on: 0001, 0002
Owner: Copilot
Agent: current session

## Context

The user supplied `SODALIS_PHASE_1_AVATAR_SPEC.md` and requested both a
resumable task breakdown and sequential implementation. The spec defines the
avatar runtime, TalkingHead adapter, scene ownership, behaviors, MPFB profile,
validator, developer harness, quality/lifecycle, and tests.

## Acceptance Criteria

- Completed Phase 0 work is summarized in task files.
- Phase 1 is decomposed into bounded tasks with explicit dependencies.
- The first implementation task is identified and started.
- Out-of-scope integrations remain excluded.

## Implementation Notes

- Attachment: `SODALIS_PHASE_1_AVATAR_SPEC.md`.
- `TASKS/README.md` is the status index; each task file is resumable on its own.

## Agent Notes

- Created historical tasks 0001–0002 and the sequential Phase 1 chain 0004–0012.
- Started 0004 as the first implementation task.
- The spec explicitly excludes production STT/TTS, LLM orchestration, RAG/
  memory, Home Assistant, and real Mail.
