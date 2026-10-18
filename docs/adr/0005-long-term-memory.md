# ADR 0005: Build a local-first, layered long-term memory in TypeScript

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Sodalis needs long-term memory (task `0039`): it should remember people,
preferences, dates, and corrections that a user mentions, without the user
having to save anything explicitly, and it must work in Dutch and English.
Sodalis is currently a research prototype that runs on synthetic data.

We reviewed three Hy-Memory papers (Tencent-Hunyuan/Hy-Memory, Apache-2.0):

- *Memory Beyond Recall* (DCPM) describes an eight-layer hierarchy with a
  synchronous System 1 writer and an asynchronous System 2 consolidation
  engine.
- *Hy-Memory-30B-A3B* describes an RL-trained extraction model that supports
  only English and Chinese.
- *CMB/TriLink* describes provenance-linked fact and experience layers. It
  shows that a small, targeted retrieved context (about 690 tokens) beats a
  larger one.

Hy-Memory itself is a large Python SDK built on Chroma, Kuzu, Qdrant, and Neo4j
backends. Its writer is triggered by explicit `add()` calls. We also reviewed
Mem0, Memobase, Supermemory, MemOS, Letta, Zep/Graphiti, MIRIX, and Cognee.
None of them combines what we need: local-first operation, TypeScript, an
embedded store, implicit capture, supersedes chains, and Sodalis consent and
retention policies, without substantial re-plumbing.

## Decision

1. **Build our own implementation in TypeScript, using Hy-Memory's ideas.**
   Do not fork Hy-Memory or adopt another framework. Hy-Memory may run as an
   optional, non-shipping Python baseline in evaluations.
2. **Place the memory domain in a new `@sodalis/memory` package.** The Sodalis
   AI service (`apps/server/src/assistant`) wires it in. There is no new
   container: the SQLite file lives on a volume.
3. **Reach every model through an OpenAI-compatible HTTP role.** The four roles
   are the gate, extraction/reconciliation, embedding, and chat. Each role has
   its own base URL and model, so oMLX, Ollama, llama.cpp, vLLM, Azure, or
   Lattice can serve it. Rust inference (Lattice) stays a sidecar and is not
   part of this repository.
4. **Make SQLite the source of truth for everything.** This covers transcripts,
   memory items, revisions, supersedes links, validity, provenance, consent,
   and audit. The vector and full-text index is a derived index behind a
   `MemoryIndex` port and can be rebuilt from SQLite at any time.
   - Version 1 uses sqlite-vec plus FTS5 in the same database file, so writes
     and deletes are transactional.
   - A Zvec adapter is added only if benchmarks show the need.
5. **Number the layers the same way as Hy-Memory's `MemoryLayer`.** This keeps
   our layers comparable with the papers and benchmarks.

   | Layer | Content | Version |
   | --- | --- | --- |
   | L0 | Basic profile information | v1 |
   | L1 | Raw turns (evidence; retention-bound) | v1 |
   | L2 | Atomic facts, versioned, with `event_at`, `valid_from`, and `valid_to` | v1 |
   | L3 | Session and episode summaries, including transient states | v1 |
   | L4 | Identity: durable attributes, preferences, and people | v1 |
   | L5 | Knowledge (entities and relations) | Phase 3 |
   | L6 | Schemas and routines | Phase 3 |
   | L7 | Intentions | Phase 3 (stated goals: v1) |

   Extraction also writes L7 when the user explicitly states an ongoing goal
   or plan; System 2 may still induce L7 items from repeated facts.
   Important dates are L2 facts with an `event_at` value, not a separate layer.

   Every item also carries:
   - sensitivity: `general` or `health`
   - provenance: `stated`, `inferred`, or `observed`
   - status: `active`, `superseded`, or `deleted`
   - a source link to its L1 turns

6. **Use a continuous write path with a fast gate (System 1).** Every user and
   assistant turn is stored as L1. Only user turns go through the gate,
   together with the preceding assistant turn as context. Extraction never
   takes facts from assistant text alone.
   - The gate is a local small LLM behind a `DecisionGate` port. Its questions
     use the `/v1/systemone` shape (`memory_worthy`, `kind`, `is_correction`)
     and are answered from option-letter log-probabilities. No cloud gate is
     used.
   - A Lattice `/v1/systemone` decider (ADR-098 in the Lattice repository) is a
     later drop-in replacement.
     `SystemOneHttpGate` already sends the questions to any `/v1/systemone`
     server. Off-the-shelf vLLM Semantic Router deciders scored below the
     gemma4 e4b gate (see the memory evaluation).
   - The gate threshold favours recall over precision.
7. **Extract and reconcile asynchronously, after the reply.** Writing never
   adds latency to the conversation.
   - Extraction produces JSON that is validated against a schema. Field names
     are English; values keep the source language.
   - A `transient` flag routes temporary states to L3 instead of L2.
   - Reconciliation retrieves the 5 nearest active items on the same subject
     and makes one batched LLM decision per item: ADD, UPDATE (the old text is
     kept as a revision), SUPERSEDE (sets the old item's `valid_to` and
     `superseded_by`; the old item stays traversable), or NOOP.
8. **Retrieve without an LLM.**
   - Embed the current user turn plus the previous assistant turn once.
   - Run a hybrid dense and FTS5 search, merged with reciprocal rank fusion,
     over active L2, L3, and L4 items.
   - Apply quotas and a relevance threshold.
   - Follow supersedes chains up to 3 steps back.
   - Pin L0, L4, L2 items whose `event_at` falls in the next 14 days, and up to
     3 active L7 intentions.
   - Inject a dated "Memory" block of at most about 800 tokens that marks
     stated versus inferred items.
   - Raw L1 transcripts are searched only through a later `recall_memory` tool.
9. **Ask for consent once, at the top level.** When real people are involved,
   one top-level consent covers memory, and a separate opt-in covers health.
   Individual memories, including inferred ones, are never confirmed one by
   one; the user can still inspect, correct, and delete them. Deleting an item
   hard-deletes it together with its revisions and index entries.
10. **Default models (open weights; Azure is an optional ceiling):**

    | Role | Default model | Candidates to evaluate |
    | --- | --- | --- |
    | Extraction and reconciliation | Qwen3.8-27B | Qwen3.6-35B-A3B, Gemma-4-26B-A4B, gpt-oss-20b, Azure |
    | Gate | Qwen3.5-2B-class model, or Mapika `decider-2b` (GGUF) | Dutch accuracy still to be verified |
    | Embedding | Qwen3-Embedding-0.6B, truncated to 512 dimensions | granite-embedding-311m-multilingual-r2 |

    Every model choice is configuration. The index records which embedding
    model and how many dimensions it was built with.
11. **Evaluate on generated data.**
    - Component metrics: gate precision and recall, extraction F1, and
      reconciliation accuracy.
    - End-to-end benchmarks: LongMemEval-S and LoCoMo.
    - A machine-translated Dutch subset of LongMemEval-S.
    - A generated Dutch set built from Flemish personas in
      `nvidia/Nemotron-Personas-Belgium` (`nl_BE`, CC-BY-4.0). A seeded event
      graph is the ground truth, an LLM renders the dialogues, and an LLM judge
      checks the result. The rendering model must differ from the extraction
      model under test.
    - Results go in `docs/evaluations/memory.md`.

## Consequences

- Sodalis keeps full control of the data model, deletion semantics, and
  remote-context minimization, at the cost of reimplementing the writer and
  reader logic that Hy-Memory already has.
- A single SQLite file makes retention, deletion, and backup simple. Replacing
  the index or changing the embedding model only requires a rebuild.
- Without per-item confirmation, extraction errors reach the prompt context.
  Mitigations are reconciliation, provenance markers, the inspect, correct,
  and delete API, and evaluation gates.
- System 2 (L5–L7), the `recall_memory` tool, observations, and Zvec are
  deferred to separate tasks.
