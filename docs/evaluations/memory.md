# Long-term memory

Status: **In progress**: harness complete and first local measurements taken;
model comparison and public-benchmark runs open.
Date: 2026-10-16. Tasks: 0048 (harness and quality), 0050 (System 2),
0051 (vector index). Design: [ADR 0005](../adr/0005-long-term-memory.md).

## Summary and recommendation

The all-local configuration works end to end on a laptop. Here, a gemma4 e4b
gate, qwen3:14b extraction and reconciliation, and a qwen3-embedding 0.6B
embedder with SQLite and sqlite-vec answered **16 of 18** Dutch recall
questions over two four-session synthetic personas. Gate, extraction,
health/transient labelling, and reconciliation were all correct on this set.
The two remaining misses are a judge false negative and one routine
question.

- Keep the local default from `.env.example`. Treat this as a pipeline check,
  not a model ranking: the set is small and template-rendered.
- **Keep SQLite with sqlite-vec; do not adopt Zvec for now (0051).** At
  10,000 items a filtered search takes 1.3 ms (p50), a full vector search
  4.1 ms, and hybrid search 6.4 ms. That is far below the 50–100 ms budget
  for one turn. A personal assistant is unlikely to reach 10,000 active
  items within years.
- The measurements led to three pipeline fixes, all now covered by tests:
  1. Extracted facts state how a person relates to the user.
  2. A correction flagged by the gate may supersede an item stored under a
     mistaken name.
  3. An L2 episode on a different day is a new occurrence rather than a
     NOOP. This lets System 2 see routines.

## Scope

In scope:

- the write path (gate, extraction, reconciliation)
- retrieval into the answer prompt
- System 2 consolidation
- vector-index latency

The questions are recall questions in Dutch: single-session facts, knowledge
updates, dates, health, routines, and abstention. Not yet measured:

- LLM-rendered (natural) conversations
- the public LongMemEval and LoCoMo sets, and the Dutch translation of
  LongMemEval
- other model sizes and Azure models
- gate-threshold sweeps
- the live `recall_memory` tool path in the AI service

## Method and hardware

The harness, `packages/memory/eval` ([commands](../development-stack.md#evaluate-long-term-memory)),
generates scenarios from a persona and a seed. A scenario is a graph of
planted events, and every event is labelled:

- whether it is worth storing
- its expected layer, subject, and keywords
- whether it is health-related or transient
- the reconciliation actions that are acceptable for it

The planted events include:

- family members
- a grandchild's name corrected two sessions later
- a pet that is mentioned again later
- a hobby
- a music preference that changes
- an upcoming appointment
- a friend's birthday
- medication
- transient moods
- a walk repeated three times
- small-talk distractors

The questions are derived from the same graph. The harness then:

1. Replays the scenario through the real `MemoryService`, with the clock set
   to each session date and the queue drained after every turn.
2. Optionally runs consolidation.
3. Asks each question with only the retrieved memory block, at the
   question's date.

Component metrics compare each turn's write trace with its labels. Answers
are graded by an LLM judge (gemma4:12b) or by keywords. Every trace, answer,
and memory block is stored with the results.

| Role | Model (Ollama 0.40.5, OpenAI-compatible API) |
| --- | --- |
| Gate | `gemma4:e4b-mlx`: 3 one-token questions per turn, with logprobs |
| Extraction, reconciliation, answer, induction | `qwen3:14b`, `reasoning_effort: none` |
| Judge | `gemma4:12b-mlx` |
| Embeddings | `qwen3-embedding:0.6b`, 512 dimensions |

- **Data:** the two built-in personas (Maria, 78, Lier; Jozef, 82, Tienen),
  seed 1, four sessions each, rendered from templates. That gives 43 user
  turns (11 of them distractors) and 18 questions.
- **Hardware:** Apple M4 Max, 128 GB, macOS 27.0.1; Node 24.13 with
  `node:sqlite` and sqlite-vec.

## Results

QA accuracy (18 questions) in successive runs:

| Run | Change | QA | Reconciliation |
| --- | --- | --- | --- |
| A | Baseline, keyword grading, no System 2 | 14/18 (78%) | 20/22 |
| B | Extraction keeps relationships; LLM judge | 15/18 (83%) | 18/22 |
| C | B with System 2 | 16/18 (89%) | 18/22 |
| D | C with correction and repeated-episode fixes | **16/18 (89%)** | **22/22** |

Run D components:

| Metric | Result |
| --- | --- |
| Gate precision / recall | 1.00 / 1.00 (32 worth storing, 11 distractors) |
| Extraction precision / recall | 1.00 / 1.00 (end to end, keyword match) |
| Health and transient labels | 2/2, 4/4 |
| Reconciliation | 22/22: ADD 16, correction 2, preference change 2, restatement 2 |
| QA by type | single-session 4/4, knowledge-update 3/4, temporal 4/4, health 2/2, routine 1/2, abstention 2/2 |
| Memory block | 334 tokens mean (budget 800); retrieval 12–22 ms including the embedding call |

Latency per call (run D means; first calls include model loading):

| Role | Calls | Mean |
| --- | --- | --- |
| Gate | 129 (3 per user turn, in parallel) | 0.1 s |
| Extraction | 32 | 2.9 s |
| Reconciliation | 22 | 2.1 s |
| Answer | 18 | 0.9 s |
| Induction | 2 | 6.2 s |

Ingesting 86 turns (43 from the user) took 159 s in total. That is about
3.7 s of background work per user turn, off the reply path.

Vector index (`bench-index`, 512 dimensions, 200 queries):

| Items | Insert per item | Vector p50 / p95 | Hybrid (FTS) p50 / p95 | Filtered p50 / p95 |
| --- | --- | --- | --- | --- |
| 2,000 | 0.09 ms | 0.86 / 0.94 ms | 1.39 / 1.50 ms | 0.29 / 0.35 ms |
| 10,000 | 0.09 ms | 4.05 / 4.16 ms | 6.41 / 6.75 ms | 1.28 / 1.40 ms |

## Analysis

- **The gate is cheap and accurate.** Parallel one-token questions with
  logprobs took about 100 ms in total and separated distractors cleanly.
  Corrections were flagged with probability ≥ 0.999. The gate saves 11 of 43
  extraction calls here, and the proportion should be higher in real small
  talk.
- **Extraction loses relationships unless asked.** In run A the fact "Lucas
  woont in Aalst" lost "zoon", so "Waar woont mijn zoon?" failed. One prompt
  rule fixed this.
- **Subject keys block name corrections.** "Not Elke but Ruben" was stored
  under the subject "Ruben", while candidate search only looked at the same
  subject. As a result, Elke stayed active next to Ruben. Correction turns now
  search across subjects.
- **NOOP hides routines.** The extraction model dated each "this morning"
  walk, but the reconciler still marked repeats as NOOP. System 2 therefore
  never saw three walks. This is now deterministic: an L2 NOOP becomes an ADD
  when no neighbour has the same occurrence day.
- **Remaining misses.**
  - The judge (gemma4:12b) rejected the correct answer "nu vooral naar Bart
    Peeters", and keyword grading accepted it in run A. Use a stronger judge,
    or spot-check judge rejections.
  - One routine question failed because the walk episode scored 0.35 cosine
    similarity to "Wat doe ik vaak 's ochtends?", exactly at
    `MEMORY_MIN_SIMILARITY`. Full-text search missed it ("ochtends" against
    "vanochtend"). The Qwen3 embedding instruction prefix raised the score to
    0.39 in a spot check. Query instructions or a slightly lower threshold
    are candidates, but should be measured on a larger set first.
- **System 2 works when evidence exists.** After the repeated-episode fix,
  induction produced a routine for one persona. Induction is slow (6 s), but
  it runs at most once a day and only when idle.

## Limitations

- The set is two personas and 18 questions, so one question is 5.6
  percentage points. Differences between runs are mostly explained by
  specific fixes, not by sampling noise, but the results do not rank models.
- The template-rendered turns are clean single statements, which is easier
  than real speech-to-text conversation. The LLM renderer exists but was not
  used.
- The judge is local and imperfect (one known false negative).
- The scenario generator, the labels, and the fixes were developed together.
  The final numbers are therefore optimistic until the run is repeated on
  new seeds and LLM-rendered conversations.

## Open items

1. Run LLM-rendered scenarios for at least 10 sampled personas (seeds 1–3)
   and compare gate thresholds 0.2, 0.3, and 0.5.
2. Run LongMemEval-S (knowledge-update and temporal-reasoning, with
   distractors) and LoCoMo locally. Translate a LongMemEval subset to Dutch
   and compare English with Dutch.
3. Compare extraction models (for example qwen3:14b with a Qwen3.8 27B on
   oMLX), and Azure only with consent for that run.
4. Measure the query-instruction prefix and `MEMORY_MIN_SIMILARITY` on the
   larger set.
5. Measure System 2 on longer histories (20+ sessions), including induced-item
   precision.
6. Repeat `bench-index` only if the item count grows by orders of magnitude.
