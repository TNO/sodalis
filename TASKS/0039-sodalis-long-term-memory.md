# 0039 Building Sodalis long-term memory

Status: open
Priority: high
Subsystem: assistant
Depends on: 0031, 0034

## Context

Sodalis is intended to be a long-term companion. It needs episodic continuity
as well as derived facts and preferences, without treating every old transcript
as a memory or presenting inferences as user-stated facts. Memory belongs
inside the Sodalis AI service, not in a direct Ollama or Azure integration.

## Acceptance Criteria

- Store conversation transcripts locally as timestamped, searchable evidence
  with configurable retention: `off`, `7d`, `30d`, `90d`, or `forever`.
- Default transcript retention to `90d`; do not store raw microphone audio.
- Provide working memory (per-turn retrieved context), the L0–L4 layers from
  ADR 0005, health sensitivity, and observation records with distinct trust,
  retrieval, and retention semantics.
- Keep derived memories as the normal long-term retrieval layer. Consult raw
  transcripts only for explicit/fallback episodic recall, not as the default
  prompt context.
- Record provenance, confidence, source type, timestamps, lifecycle state, and
  source conversation for durable memories.
- Distinguish directly stated facts from inferred routines and observations.
  For example, a repeated Wednesday visit may create an inferred routine,
  not a directly stated routine.
- Do not ask the user to confirm individual memories. Derived and inferred
  memories are used directly, marked with their provenance, and remain
  inspectable, correctable, and deletable (see ADR 0005).
- Before first normal use, present a clear, plain-language explanation of
  memory: what Sodalis may retain, the configured transcript retention, and
  how the user can inspect, correct, and delete it.
- Require one top-level consent before memory is used with real people, and a
  separate onboarding opt-in before health memory is enabled. Record
  the accepted explanation/policy version; do not ask for repeated approval
  for every health fact after consent.
- Explain clearly that remembering health information does not authorize
  sharing it with family, caregivers, clinicians, or other services.
- Keep health memory disabled until deliberate opt-in. Separate user-stated
  health facts from sensor observations and inferences.
- Support inspecting, correcting, superseding, and deleting transcripts and
  derived memories, including provenance where useful.
- Let the user ask what Sodalis remembers about a person or topic and inspect
  the derived memories returned.
- Never store credentials as conversational memory.
- Keep retrieved memory local by default. If a remote LLM is explicitly
  selected, send only the current turn and selectively retrieved relevant
  memories; never send the full transcript archive.
- Do not implement caregiver/clinician sharing, medical diagnosis, emergency
  escalation, automatic health conclusions from Home Assistant, indefinite
  audio retention, or unrestricted autonomous consolidation.
- Include tests for retention, consent, supersession, provenance,
  corrections/deletion, retrieval, and remote-context minimization.

## Implementation Notes

- Design: [ADR 0005](../docs/adr/0005-long-term-memory.md). This task is the
  umbrella milestone. Work happens in tasks 0045–0048 (version 1) and
  0049–0052 (follow-ups). Close it when 0045–0048 are done.
- Sodalis is a research prototype on synthetic data. ADR 0005 replaces the
  earlier candidate and confirmation flow with top-level consent.

- Initial defaults: memory enabled; transcript, semantic, episodic, and
  observations enabled; derived memory retained indefinitely; raw audio
  storage disabled; health memory disabled until onboarding consent.
- Transcript retention defaults to 90 days and remains configurable.
- Health-memory onboarding must be understandable without legal or technical
  knowledge and separate from generic terms.
- The explanation should communicate that Sodalis can remember things the
  user shares so they do not need to explain them again. Health-memory
  onboarding must explain that, with deliberate opt-in, health, medication,
  and mobility information may inform future assistance; the user can
  review/correct those memories; and remembering them does not authorize
  sharing with family, caregivers, clinicians, or other services.
- Observation ingestion must preserve its source and must not independently
  produce health conclusions.
- Inferred routines must remain visibly distinguishable from direct
  statements (provenance `inferred`), but do not need per-item confirmation.
- This is a separate milestone from the AI service/provider facade in task
  `0031`.

## Agent Notes

- The memory service stores evidence and derived memories separately. Long
  transcript retention is configurable; derived memories are the primary
  long-term context.

- 2026-10-16 Copilot: Version 1 is implemented by 0045–0047, with evaluation
  (0048), recall (0049), System 2 (0050), and observations (0052) in progress;
  see their notes and the [evaluation](../docs/evaluations/memory.md).
  Remaining here: the desktop's plain-language memory explanation and consent
  onboarding (top-level and health), and the inspect, correct, and delete UI on
  top of `/api/memory/*`.

- 2026-10-27 Copilot: Added cross-topic
  [personal-assistant memory and embodiment research](../docs/evaluations/personal-assistant-memory-and-embodiment.md).
  Research only; no implementation or acceptance-criteria status changed.
