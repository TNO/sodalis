# Long-term memory

Status: **Local evaluation complete** (tasks 0048–0050); the Azure ceiling is
deferred because no Azure endpoint is configured and cloud runs require
explicit consent. Follow-ups are listed under open items.
Date: 2026-10-18. Tasks: 0048 (harness and quality), 0049 (`recall_memory`),
0050 (System 2), 0051 (vector index). Design:
[ADR 0005](../adr/0005-long-term-memory.md).

## Summary and recommendation

The all-local pipeline answers 68 of 72 Dutch recall questions on
LLM-rendered conversations with six sampled elderly Flemish personas. It
uses:

- a gemma4 e4b gate;
- qwen3:14b for extraction, reconciliation, and answers;
- qwen3-embedding 0.6B;
- SQLite with sqlite-vec.

On a matched LongMemEval-S sample it scores **32/50 (64%) in English** and
**30/50 (60%) in machine-translated Dutch**.

- **Keep qwen3:14b as the local extraction model.** It was the most accurate
  candidate; Gemma-4-26B-A4B had the shortest per-call latency but lower
  extraction recall and QA. The newer Qwen3.8-27B was the
  weakest. It is conservative: it skips episodes, repeated activities, and
  moods, and so loses routines and intentions (54/72 with p3).
- **Keep the gemma4 e4b gate and lower its threshold to 0.1 (now the
  default).** At 0.1 it keeps 98% precision, but recall rises from 0.88 to
  0.97, for 9% more extraction calls. QA rose to 68/72 (69 after System 2), the best
  result. It still filters about half of all turns in about 0.4 s. A pass-all
  gate (llama3.2:3b in effect) scored 67/72 at 2.2 times the extraction calls.
- **Do not replace the gate with an off-the-shelf decision model yet.**
  `vllm-sr/Vela-2.0-0.3B` and `vllm-sr/d3-edge` were fast on CPU (0.05–0.2 s),
  but separated worthy turns poorly (AUC at most 0.55 and 0.86, against
  0.998). `SystemOneHttpGate` stays available for a fine-tuned or larger
  decider, for example one served by Lattice's planned `/v1/systemone`.
- **Keep qwen3-embedding 0.6B at 512 dimensions.** granite-embedding-311m
  scored the same within noise (65 against 63–66) and offers no reason to
  switch.
- **`minClusterSize` is now 2 by default.** With 3, induction produced 3
  items over 6 personas; with 2, 12. QA after System 2 did not change on this
  set (routine questions are answered from the episodes themselves), so System
  2 stays on but is not yet shown to help QA.
- **Keep SQLite with sqlite-vec; defer Zvec (0051).** At 10,000 items a
  filtered search takes 1.3 ms (p50), hybrid search 6.4 ms, far below the
  per-turn budget.
- The evaluation led to these fixes, all covered by tests:
  1. The extractor keeps the user's language. A deterministic language hint
     replaced the prompt rule alone, which qwen3:14b ignored (it stored English
     PersonaMem conversations in Dutch).
  2. The extractor stores episodes, repeated activities, and the user's own
     moods; it never invents profile facts or stores forget requests.
  3. L7 goals are tagged `goal` in the memory block, so the answer model does
     not confuse them with appointments.
  4. The `recall_memory` instruction says the JSON must be the entire reply.
  5. The judge receives a JSON payload, and "I do not know" answers are graded
     deterministically (see analysis).

## Scope

In scope:

- the write path (gate, extraction, reconciliation) and retrieval
- the `recall_memory` tool path (task 0049), as the answer model sees it
- System 2 consolidation (task 0050)
- public benchmarks: LongMemEval-S, LoCoMo, PersonaMem-v2, and a Dutch
  translation of a LongMemEval-S sample
- model candidates for extraction, gate, and embeddings, all local

Not measured:

- Azure models, as a ceiling (needs consent for each run)
- Hy-Memory as a Python baseline (optional in 0048)
- real speech-to-text input and the live server stream
- conversational forgetting, which does not exist yet (task 0053)

## Method and hardware

The harness, `packages/memory/eval`
([commands](../development-stack.md#evaluate-long-term-memory)), replays each
case through the real `MemoryService`. The clock is set to each turn's time
and the queue drained after every user turn. It then asks each question with
only the retrieved memory block and, unless disabled, the `recall_memory`
instruction. A recall request triggers a second answer with the excerpts.
Component metrics compare each write trace with labels derived from the
scenario graph.

**Synthetic Dutch set.** Six personas aged 70 and older, sampled from
`nvidia/Nemotron-Personas-Belgium` (`nl_BE`, CC-BY-4.0), seed 1:

- six sessions each, and 241 user turns in total;
- rendered by gemma4:12b (not the extraction model);
- every planted fact verified by the judge, with no template fallbacks.

There are 72 questions:

| Type | Questions |
| --- | --- |
| Single-session | 12 |
| Knowledge-update | 12 |
| Temporal | 12 |
| Routine | 12 |
| Health | 6 |
| Explicit recall | 6 |
| Intention | 6 |
| Abstention | 6 |

**Public benchmarks:**

| Benchmark | Sample |
| --- | --- |
| LongMemEval-S (cleaned, MIT) | 10 per question type, evidence sessions plus 4 distractor sessions, 60 questions |
| LongMemEval-S matched with Dutch | 10 per type for 5 types, 2 distractor sessions, 50 questions |
| Dutch LongMemEval-S | The same 50 questions, translated by qwen3:14b. Assistant turns are cut to 400 characters. |
| LoCoMo (CC BY-NC, local only) | First 2 conversations, adversarial questions skipped, 233 questions. Both speakers are treated as the user. |
| PersonaMem-v2 (CC-BY-4.0) | 4 personas, 159 four-option questions on implicit preferences |

One Dutch case timed out during the matched run and was retried individually
with a longer local timeout. It is included in the 50-case score; the original
failed attempt is retained alongside the combined result in ignored eval data.

**Grading.**

- Multiple-choice answers are graded by the chosen letter.
- An answer that says "I do not know" is correct only for abstention
  questions. This is decided by a pattern, not by the judge, unless the hedge
  is followed by an answer ("but …").
- Other answers go to gemma4:12b (non-thinking), which compares a JSON
  payload of question, reference, and answer.
- `rejudge` re-graded all stored results with these final rules.

**Roles.**

| Role | Model (Ollama, OpenAI-compatible API) |
| --- | --- |
| Gate | `gemma4:e4b-mlx`: 3 one-token questions per turn, with logprobs; threshold 0.3, except the sweep and the matched LongMemEval-S runs (0.1, the new default) |
| Extraction, reconciliation, induction | `qwen3:14b` unless stated, `reasoning_effort: none` |
| Answer | `qwen3:14b`, `reasoning_effort: none`, in every run |
| Judge | `gemma4:12b-mlx`, `reasoning_effort: none` |
| Embeddings | `qwen3-embedding:0.6b`, 512 dimensions |

**Prompt versions.** The extractor prompt changed during the evaluation.
Runs are labelled:

- p1: the original prompt;
- p2: adds the language rule, episodes and moods, no invented L0 facts, and
  ignores forget requests;
- p3: p2 plus the deterministic language hint, the repeated-activity rule,
  the `goal` tag, and the stricter recall instruction.

**Hardware.** Apple M4 Max, 128 GB, macOS 27.0.1; Node 24.13 with
`node:sqlite` and sqlite-vec. Runs used concurrency 2. Latencies of the p1
model comparison are inflated by GPU sharing with other runs, so the latency
table uses only runs that had the GPU to themselves.

## Results

### Synthetic Dutch set: extraction models

QA out of 72, before and after System 2. Gate and extraction are precision /
recall; reconciliation is action accuracy.

| Extraction model | Prompt | QA | After System 2 | Extraction P / R | Reconciliation | Induced |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3:14b | p1 | 63 | 63 | 0.97 / 0.86 | 0.96 | 7 |
| qwen3:14b | p2 | 66 | 66 | 0.97 / 0.88 | 0.96 | 12 |
| qwen3:14b | p3 | 66 | 66 | 0.98 / 0.88 | 0.97 | 10 |
| Qwen3.8-27B (MLX) | p1 | 48 | 48 | 0.87 / 0.65 | 0.89 | 1 |
| Qwen3.8-27B (MLX) | p2 | 49 | 49 | 0.93 / 0.72 | 0.89 | 0 |
| Qwen3.8-27B (MLX) | p3 | 54 | 54 | 0.88 / 0.77 | 0.89 | 0 |
| Qwen3.6-35B-A3B | p1 | 58 | 57 | 0.91 / 0.89 | 0.93 | 10 |
| Gemma-4-26B-A4B | p1 | 62 | 63 | 0.86 / 0.80 | 0.92 | 11 |
| Gemma-4-26B-A4B | p3 | 63 | 63 | 0.80 / 0.78 | 0.90 | 13 |
| gpt-oss-20b (reasoning low) | p1 | 60 | 60 | 0.96 / 0.88 | 0.93 | 10 |

QA by type for qwen3:14b:

| Type | p1 | p2 | p3 |
| --- | --- | --- | --- |
| Single-session | 12/12 | 12/12 | 12/12 |
| Knowledge-update | 10/12 | 11/12 | 12/12 |
| Temporal | 12/12 | 12/12 | 12/12 |
| Health | 6/6 | 6/6 | 6/6 |
| Routine | 8/12 | 9/12 | 8/12 |
| Explicit recall | 5/6 | 5/6 | 5/6 |
| Intention | 4/6 | 5/6 | 5/6 |
| Abstention | 6/6 | 6/6 | 6/6 |

Qwen3.8-27B scored 2/12 on routine and 0/6 on intention with p2, and 4/12 and 4/6 with p3. Gemma-4-26B-A4B extracted fastest (1.8 s per call), but at the lowest recall, and scored 5/12 on routine.

### Synthetic Dutch set: other components

All variants use qwen3:14b with prompt p1 unless stated.

| Variant | QA | After System 2 | Gate P / R | Extraction calls | Notes |
| --- | --- | --- | --- | --- | --- |
| Baseline (gemma4 e4b gate, threshold 0.3) | 63 | 63 | 0.98 / 0.88 | 109 | p3 at 0.3: 66, 108 calls |
| Gate llama3.2:3b | 67 | 67 | 0.50 / 1.00 | 243 | Passes nearly every turn; extraction recall 0.96 |
| Gate threshold 0.1 (p3; new default) | 68 | 69 | 0.98 / 0.97 | 118 | Extraction recall 0.96; knowledge-update 12/12, recall 6/6 |
| Gate threshold 0.5 (p3) | 65 | 65 | 0.98 / 0.84 | 103 | |
| granite-embedding-311m-multilingual-r2 | 65 | 65 | 1.00 / 0.88 | 110 | Memory block 500 tokens against 375 |
| `minClusterSize` 3 (former default) | 65 | 64 | 0.98 / 0.88 | 110 | 3 items induced against 7–12 |
| Without `recall_memory` | 66 | | 0.98 / 0.88 | 110 | Explicit recall still 5/6 |
| Without memory (p3) | 6 | | | 0 | Only the 6 abstention questions |

The baseline and the `minClusterSize` 3 run use the same configuration before
System 2 (63 against 65). That gap is the run-to-run noise: local inference
is not deterministic under concurrent requests, even at temperature 0.

### Synthetic Dutch set: dedicated decision models as the gate

Measured 2026-10-18. The decision models of vLLM Semantic Router answer
System One questions with probabilities and no text generation. They ran in
`vllm-sr serve` (0.5.0.dev20261017, engine mode) on CPU in the Podman VM
(8 CPUs, 8 GiB), through `SystemOneHttpGate` (`EVAL_GATE_PROVIDER=systemone`).
Labels are the 241 user turns of the synthetic set (120 worthy). AUC is the
area under the ROC curve of `memory_worthy`. "Best P / R" is the threshold
with the highest F1, in steps of 0.05. The probe variants are:

- *ours*: the production state and question;
- *short*: the user message only, with "Does this message share personal
  information about the speaker or their life?";
- *request*: `{request, context}` state fields.

The probes call the server directly and are not committed.

| Gate | Size | AUC (ours / short / request) | Best P / R | Time per question |
| --- | --- | --- | --- | --- |
| gemma4:e4b-mlx (current, logprobs) | 4B effective | 0.998 / – / – | 0.98 / 0.97 at 0.1 | 0.33 s per decision, 3 questions in parallel, Metal |
| `vllm-sr/Vela-2.0-0.3B` | 0.3B encoder | 0.31 / 0.55 / 0.35 | 0.53 / 0.96 | 0.05–0.07 s, CPU |
| `vllm-sr/d3-edge` (float32) | 0.8B | 0.71 / 0.86 / 0.76 | 0.69 / 0.89 (short) | 0.16–0.22 s, CPU |
| `vllm-sr/d3-nano` | 2.2B | not run | | Killed for lack of memory in the 8 GiB VM, in float32 and bfloat16 |

One full run used Vela at threshold 0.1 (`syn-vela03-t01`). It passed every
turn: gate P/R 0.50 / 1.00 and 241 extraction calls, against 118. QA was
67/72, and 68 after System 2, the same as the current gate. The extractor
then acts as the filter, at twice the extraction cost. Vela's `is_correction`
fired on 89 of 121 unworthy turns ("Goedemorgen." scored 0.82 worthy and a
correction), so even a high threshold cannot be used with it. d3-edge did not
load in bfloat16 on CPU: vllm-sr's start-up check reported "golden answers
differ from the reference"; float32 passed.

### Public benchmarks (qwen3:14b)

| Benchmark | Prompt | QA | Without memory |
| --- | --- | --- | --- |
| LongMemEval-S, 6 types (60) | p2 | 37/60 (62%) | Not measured |
| LongMemEval-S matched, English (50) | p3 | 32/50 (64%) | Not measured |
| LongMemEval-S matched, Dutch (50) | p3 | 30/50 (60%) | Not measured |
| LoCoMo, 2 conversations (233) | p2 | 65/233 (28%) | Not measured |
| PersonaMem-v2 (159, chance 25%) | p1 | 44/159 (28%); 42 after System 2 | — |
| PersonaMem-v2 (159) | p2 | 44/159 (28%); 42 after System 2 | 43/159 (27%) |

Matched LongMemEval-S by answer type:

| Type | English | Dutch |
| --- | --- | --- |
| Abstention | 4/5 | 4/5 |
| Single-session preference | 5/10 | 5/10 |
| Knowledge-update | 8/10 | 7/10 |
| Temporal reasoning | 5/10 | 3/10 |
| Multi-session | 3/7 | 3/7 |
| Single-session user | 7/8 | 8/8 |

LongMemEval-S (p2) by type:

| Type | Correct |
| --- | --- |
| Knowledge-update | 10/10 |
| Single-session (user) | 7/7 |
| Abstention | 5/5 |
| Multi-session | 6/9 |
| Temporal reasoning | 4/9 |
| Single-session preference | 4/10 |
| Single-session (assistant) | 1/10 |

LoCoMo by category:

| Category | Correct |
| --- | --- |
| Single-hop | 33/114 |
| Multi-hop | 12/43 |
| Temporal | 17/63 |
| Open-domain | 3/13 |

PersonaMem-v2 (p2) by type:

| Type | Correct |
| --- | --- |
| Therapy background | 10/22 |
| Stereotypical preferences | 9/21 |
| Ask to forget | 8/29 |
| Sensitive information | 7/23 |
| Anti-stereotypical preferences | 4/20 |
| Neutral preferences | 4/22 |
| Health and medical conditions | 2/22 |

### Latency and tokens

Measured on the synthetic set with qwen3:14b (p2), alone on the GPU. The
answer and judge share the GPU with the background write path.

| Role | Calls | Mean per call | Tokens per call |
| --- | --- | --- | --- |
| Gate | 723 (3 per user turn, in parallel) | 0.4 s | 128 |
| Extraction | 109 | 4.2 s | 1,033 |
| Reconciliation | 79 | 3.2 s | 627 |
| Answer | 148 | 1.3 s | 652 |
| Induction | 10 | 6.0 s | 604 |

- **Ingest.** Ingest took 13.8 minutes for 241 user turns and their replies
  (summed per case). That is about 3.4 s of background work per user turn,
  off the reply path.
- **Retrieval.** 23 ms mean, including the embedding call. The memory block
  was 375 tokens on average (budget 800).
- **Larger models.** Qwen3.8-27B (MLX) extracted in 3.9 s per call. The p1
  numbers for the other models (8.8–15.2 s) were measured under contention
  and only rank them roughly. gpt-oss-20b was the slowest.

The vector-index measurements (`bench-index`, 512 dimensions, 200 queries)
are unchanged from the first run:

| Items | Insert per item | Vector p50 / p95 | Hybrid (FTS) p50 / p95 | Filtered p50 / p95 |
| --- | --- | --- | --- | --- |
| 2,000 | 0.09 ms | 0.86 / 0.94 ms | 1.39 / 1.50 ms | 0.29 / 0.35 ms |
| 10,000 | 0.09 ms | 4.05 / 4.16 ms | 6.41 / 6.75 ms | 1.28 / 1.40 ms |

## Analysis

- **The local judge needed guard rails.** gemma4:12b in non-thinking mode
  graded correct answers as wrong when the question, reference, and answer
  came as labelled plain text. With a JSON payload it graded correctly, but
  then accepted "Ik weet het niet" as correct for ordinary questions. Grading
  non-answers by pattern removed both errors. A hedge followed by an answer
  ("I am not sure, but …") still goes to the judge. `rejudge` changed 0–10 grades
  per run; the most were for Qwen3.8-27B, which abstains more. Thinking mode
  was more reliable but took 56 s instead of 4 s per call.
- **Prompt conflicts cost more than model size.** The original extractor
  prompt asked for "durable, high-value" memories and excluded "generic
  emotions". Larger models obeyed this literally and dropped episodes ("I went
  for a walk this morning") and the user's moods. That conflicts with L2
  episodes and L3 states. Qwen3.8-27B lost most routines and every explicit
  recall question. Prompt p2 raised its extraction recall from 0.65 to 0.72
  and explicit recall from 0/6 to 5/6, but it still skipped repeated
  activities ("weer gaan wandelen"). Prompt p3 adds a rule for those, which
  raised it to 0.77 recall and 54/72, still well below qwen3:14b.
- **Extraction must keep the conversation's language.** PersonaMem-v2 showed
  qwen3:14b translating English conversations into Dutch memories. It also
  invented an L0 profile ("woont in Nederland, spreekt Nederlands"),
  apparently from the Dutch examples in the prompt. The p2 prompt rule
  alone did not fix the language; a deterministic stopword-based hint in the
  user prompt did.
- **Forget requests were stored as memories.** PersonaMem's "ask to forget"
  turns became items such as "De gebruiker wil dat de assistent vergeet dat
  …", which repeat the fact the user wanted gone. The extractor now ignores
  such requests. Acting on them is task 0053.
- **The gate threshold was set too high.** At 0.3 gemma4 e4b passed 88% of
  the worthy turns at 98% precision; the turns it missed were mostly short
  updates and episodes, which cost knowledge-update and recall questions. Its
  probabilities are well separated: lowering the threshold to 0.1 recovered
  almost all of them (recall 0.97) without losing precision, while 0.5 lost
  more (0.84). A pass-all gate adds no recall over 0.1 and doubles the cost.
- **System 2 does not move QA yet.** It induced 7–12 items on six personas
  with `minClusterSize` 2. QA after System 2 changed by at most ±2. The
  routine questions ("Waar ga ik vaak wandelen?") can also be answered from
  the episodes it clusters. PersonaMem-v2, which measures implicit
  preferences, also showed no gain (44 to 42). The benefit claimed by DCPM may
  need longer histories than six sessions, or questions that only the
  induced item can answer.
- **`recall_memory` is rarely used.** The answer model called it 0–2 times
  per run. The explicit-recall questions are mostly answered from the derived
  memories, and disabling the tool did not lower QA (66). In English it often
  announced a search ("Let me search for it") instead of calling the tool.
  Partly, the harness answer prompt told it to say "I do not know" first; p3
  fixes that. qwen3:14b still sometimes writes prose before the JSON. The
  server accepts a recall request only at the start of the reply, so such
  replies are not recalls. This explains LongMemEval's 1/10 on
  assistant-content questions: Sodalis deliberately does not extract what the
  assistant said, and only recall can find it.
- **LongMemEval-S:** knowledge updates, single-session facts, and abstention
  are solved. Temporal reasoning (4/9) needs date arithmetic over episodes
  that were often stored without the exact date. Preferences (4/10) need the
  answer model to apply a stored preference to an open request.
- **LoCoMo fits poorly.** It is a chat between two friends about each other.
  The gate and extractor are built around the user's own life, so most
  third-person small talk was filtered: 296 of 788 turns passed. Neither
  speaker is the user, so subjects and relationships are ambiguous. The score
  (28%) is not a target for Sodalis.
- **PersonaMem-v2 does not measure this pipeline.** It asks the answer model
  to pick the most personalised of four similar replies. With qwen3:14b this
  stayed at 28% (25% is chance), and without any memory it scored 27%. The
  stored preferences are present in the memory block but do not change which
  option qwen3:14b picks. A larger answer model, or a prompt that asks it to
  apply the memories, is needed before PersonaMem says anything about System 2.
- **Dutch against English:** the matched Dutch score is 4 questions lower
  than English (30/50 against 32/50). The largest difference is temporal
  reasoning (3/10 against 5/10); this small sample and the translation
  artifacts do not establish a language effect.

## Limitations

- The synthetic set has six personas and 72 questions, so one question is 1.4
  percentage points. Run-to-run noise is about ±2 questions. Differences
  below 3–4 questions do not rank configurations.
- The scenario generator, the labels, and the fixes were developed together,
  so synthetic scores are optimistic. Use the public sets for absolute levels.
- The public benchmarks were sampled down to keep local runs within hours
  (LongMemEval-S: 2 or 4 distractor sessions instead of about 50). Their
  scores are not comparable with published full-set results.
- The judge is a local 12B model. The deterministic rules remove its known
  errors, but free-form grading was spot-checked only.
- The Dutch subset is machine-translated by qwen3:14b. A spot check of ten
  questions and answers found names, numbers, and most meanings intact, but
  also calques, a mixed u/je register, and wrong or unnatural terms ("smoker"
  became "roker"; kanimeshi became "kreeftsbloemkoolbowl"). Dutch scores
  include translation noise.
- The prompt changed between runs. Compare only rows with the same prompt
  label.

## Open items

1. Conversational forgetting (task 0053), with forget cases in this
   evaluation.
2. Tolerate prose before a `recall_memory` request, or use native tool calls,
   and measure the tool on assistant-content questions.
3. Measure System 2 on longer histories (20+ sessions), with questions that
   only an induced item answers, and induced-item precision.
4. Store exact dates for episodes and measure temporal reasoning again.
5. Run Azure extraction as a ceiling, with consent for that run.
6. Hy-Memory as a Python baseline, if a direct comparison is still wanted.
7. Repeat `bench-index` only if the item count grows by orders of magnitude.
8. A dedicated decision gate: try d3-nano or d3-mini with more VM memory (or
   natively), and a decider fine-tuned on labelled Dutch turns. Lattice can
   serve the Qwen3.5-based d3 models once its `/v1/systemone` (ADR-098)
   lands; Vela's ModernBERT encoder would need a new Lattice architecture.
