# Personal-assistant memory and embodiment for older adults

Status: **Research complete; recommendations not implemented or clinically
validated.**
Date: 2026-10-27.
Related tasks: [0039](../../TASKS/0039-sodalis-long-term-memory.md),
[0054](../../TASKS/0054-evaluate-metahuman-avatar.md).
Repository baseline: `48df041f6403b2b161afcf541f2dfbf490914156`.

## Summary and recommendation

Keep Sodalis's local-first TypeScript/SQLite memory. Improve temporal
correctness, provenance, correction/forgetting, applying remembered
constraints, accessible consent controls, and reliable bounded actions
before adopting another memory framework or optimizing the vector store.

Use one assistant identity with interchangeable presentations. A calm
abstract presence, optional restrained human, and complete no-character
mode are a defensible starting hypothesis. **No reviewed evidence
establishes a universally best avatar for older adults**, or that
photorealistic appearance causes better health outcomes.

Prioritize agenda/reminders, selected email/message drafting, family
contact, document explanation, and grocery-list/cart preparation.
Sending, purchasing, public posting, health-data sharing and caregiver
access need separate authorization, not just memory consent.

## Scope

The evaluation covers:

- Hy-Memory-related research and the Nature personal-health-agent paper;
- current OpenAI dots/memory/Health and Hark product patterns;
- everyday capabilities that may appeal to older adults;
- voice-only, abstract, animal, simple-human and photorealistic embodiment;
- implications for the existing Sodalis boundaries and follow-up work.

This is not a clinical recommendation, systematic meta-analysis,
production-readiness assessment, or implementation of new integrations.
Independent older adults, people with sensory impairments and people
with dementia must not be treated as one interchangeable population.

## Method and hardware

Desk research used primary papers, accessible abstracts/full texts,
official product documentation and policies, accessibility guidance, and
direct inspection of the memory package, server wiring, action runtime,
app SDK, avatar presentation/catalogue and task records.

No new benchmarks, participant sessions, rendering measurements, account
connections or cloud-provider runs were conducted. Public document
retrieval did not send private conversations, audio, health records,
licensed assets or repository code to the products under investigation.
Hardware is not a new experimental variable.

## Results

### Memory and personal-agent architectures

| Source | Finding | Implication |
| --- | --- | --- |
| [DCPM: Memory Beyond Recall](https://arxiv.org/abs/2606.09483), 2026 arXiv version | Separates online capture from background consolidation and higher-level memory | Preserve the existing System 1/System 2 split and evidence-linked revision |
| [Hy-Memory-30B-A3B](https://arxiv.org/abs/2610.22196), 2026 preprint | Trains the memory writer independently of reader/retrieval, penalizing omission, inversion, stale state and over-storage | Borrow the failure taxonomy and matched evaluation; do not assume a 30B writer is required |
| [CMB/TriLink](https://github.com/Tencent-Hunyuan/Hy-Memory/blob/main/docs/papers/CMB_A_Coding_Memory_Benchmark_for_Long_Horizon_and_Interleaved_Coding_Agents.pdf), author-reported ICLR 2027 submission | Connects facts, reusable experience and concrete code changes | Preserve evidence links for higher-level conclusions; coding results do not validate health use |
| [The anatomy of a personal health agent](https://www.nature.com/articles/s41586-026-11161-8), Nature, 2026-10-21 | Coordinates data-science, domain-expert and coaching agents | Borrow task-specific grounded subflows, not a multi-agent call chain for every utterance |
| [OpenAI memory dreaming](https://openai.com/index/chatgpt-memory-dreaming/) | Background synthesis; context carry-forward, preference use and time-staleness are separate objectives | Evaluate whether memories are used correctly, not merely retrieved |
| [OpenAI dots](https://openai.com/index/introducing-dots/) and [safety description](https://openai.com/index/how-we-build-safety-security-and-privacy-into-dots/) | Persistent delegated work, scoped workspaces, action review and monitoring | Keep memory separate from capability/approval policy |
| [Hark](https://hark.com/) | Continuous conversation, Projects, Action Buttons, Panels and browser tasks | Make context useful for explicit everyday tasks; proprietary memory internals remain undisclosed |

OpenAI dots is confirmed by current OpenAI sources. It should not be
automatically conflated with the separately named New Computer Dot app.
The older product's present status was not independently established.

The public [Hy-Memory framework](https://github.com/Tencent-Hunyuan/Hy-Memory)
is a Python SDK with Chat/Working/Coding pipelines, distinct from its
trained writer. Its README reports DCPM's EMNLP 2026 acceptance; that venue
status was not independently checked. The README's eight-layer shorthand
and the article's five named content kinds should not be conflated with
Sodalis's exact L0-L7 contract. CMB's opening material was examined;
the older ADR's approximately 690-token figure was not reconfirmed and
is not relied on here.

The Nature paper is principally an orchestration/data-analysis paper,
not proof of a best memory store or improved older-adult health outcomes.
Its WEAR-ME source cohort has 1,165 participants, but one personalized
answer evaluation has only 17 users. Reported analysis-plan quality is
about 75.6% versus 53.7% baseline; full-agent responses average about
205 seconds and 6.5 LLM calls. The cohort size must not be substituted
for every evaluation sample size, and rubric scores are not clinical
safety rates.

Two product-policy details are particularly important:

- Hark's [privacy policy](https://hark.com/privacy-policy) asks users not
  to provide sensitive information, including health data. Its vault,
  encryption and third-party-processing descriptions do not establish an
  independently verified end-to-end architecture for all AI computation.
- The [later ChatGPT Health update](https://openai.com/index/health-in-chatgpt/)
  supersedes the [initial separate-space description](https://openai.com/index/introducing-chatgpt-health/):
  connected health information can inform other conversations with
  permission. It distinguishes connected source data, conversational
  memories and retained conversation history. Disconnection does not
  automatically erase every derivative.

### Existing Sodalis implementation

[ADR 0005](../adr/0005-long-term-memory.md) already selects a local-first,
layered memory domain with SQLite, derived hybrid indexes, provenance,
supersession and consent. The current code also implements episodic
recall and evidence-linked System 2 consolidation; older ADR statements
listing these as future work are not the full implementation picture.

The [existing evaluation](memory.md) reports 68/72 synthetic Dutch QA
before consolidation and 69/72 after it in one selected configuration,
but only six synthetic personas and six sessions per persona. Matched
reduced-context LongMemEval-S samples scored 32/50 English and 30/50
machine-translated Dutch. These are not full-benchmark or clinical
scores. System 2's QA benefit is not demonstrated reliably.

Relevant implementation surfaces:

- [`MemoryService.ts`](../../packages/memory/src/MemoryService.ts),
  [`WritePipeline.ts`](../../packages/memory/src/WritePipeline.ts),
  [`Retriever.ts`](../../packages/memory/src/Retriever.ts),
  [`Recall.ts`](../../packages/memory/src/Recall.ts) and
  [`Consolidator.ts`](../../packages/memory/src/Consolidator.ts).
- [`MemoryStore.ts`](../../packages/memory/src/MemoryStore.ts): retention,
  source links, corrections and dependent inference deletion.
- [`AssistantActions.ts`](../../packages/assistant/src/AssistantActions.ts)
  and [app SDK](../../packages/app-sdk/README.md): typed actions,
  risk and exact-invocation confirmations, not arbitrary Aster DOM access.
- [`MockMailApplication.ts`](../../apps/desktop/src/assistant/MockMailApplication.ts):
  Mail is a mock, not delivered real-account integration.
- [`AvatarPresentationController.ts`](../../apps/desktop/src/avatar/AvatarPresentationController.ts)
  and [`avatarCatalogue.ts`](../../apps/desktop/src/avatar/avatarCatalogue.ts):
  persisted human-asset choice, visibility and presentation controls.

One configuration discrepancy needs follow-up: the evaluation and writer
describe a 0.1 gate threshold, but
[`memoryConfig.ts`](../../apps/server/src/assistant/memoryConfig.ts)
falls back to 0.3 unless configured otherwise. No running deployment was
inspected and this evaluation does not change it.

### Useful features: evidence and prioritization

[Wolfe et al., 2025](https://doi.org/10.2196/65776) studied 28 adults
aged 65-84: appointment reminders were desired by 89%, emergency
assistance by 79%, and health monitoring by 75%. This small sample does
not establish a universal ranking or authorize emergency functionality.

[AARP's 2025 technology report](https://www.aarp.org/pri/topics/technology/internet-media-devices/2025-technology-trends-older-adults/)
supports the relevance of communication, health, shopping/food delivery
and tailored digital support, but its online US survey of 3,605 adults
overall is not a Dutch eighty-plus requirements study.

| Priority | Candidate capability | Initial boundary |
| --- | --- | --- |
| First | Agenda and explicit reminders | Persistent scheduler; exact date/time; no assumption of completion |
| First | Selected email/messages and family contact | Read/draft first; recipient preview and confirmed sending |
| First | Explain a selected letter or document | Source visible; no invented legal/medical meaning |
| First | Grocery lists and prepared carts | Merchant, items, substitutions, total and delivery confirmed before payment |
| Later, separately governed | Medication organization and visit preparation | User-entered/verified sources; no dosage changes or inferred adherence |
| Later | Social-media posting, real-home safety controls, caregiver sharing | Audience, risk and disclosure scopes must be explicit |

Vendor feature lists from [ElliQ](https://elliq.com/),
[Hark terms](https://hark.com/terms) and
[ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/)
show product directions, not independently established older-adult
benefits.

### Embodiment evidence

| Evidence | Result | What it does not prove |
| --- | --- | --- |
| [Chattopadhyay et al., 2020](https://doi.org/10.2196/18839), virtual-human meta-analysis | Small pooled benefit: SMD 0.166, 95% CI 0.039-0.292; mixed patient populations | That older adults need a human face, or more realism is better |
| [Bickmore et al., 2013](https://doi.org/10.1111/jgs.12449), 263 older adults, mean 71.3 | Embodied exercise-coach package improved steps at two months; full-sample twelve-month difference not significant | An effect caused by avatar appearance; form was not randomized |
| [Curtis et al., 2021](https://doi.org/10.2196/31737), 45 comparative experiments | Many visual/design changes had no user-experience effect | That all designs are equivalent or a universal optimum exists |
| [Choudhry et al., 2026](https://doi.org/10.2196/96114), 20 older-adult interviews with visual probes | Preferences varied; relatability and role mattered | Population-wide preference or outcome causality |
| [Kim and Jeon, 2026](https://doi.org/10.2196/95232), 34 care-robot RCTs, 2,476 participants | Narrow, fragile benefits with low/very-low certainty | That an animal screen avatar inherits physical robot effects |
| [Inoue et al., 2026](https://doi.org/10.1002/alz.71163), PARO, 85 people with dementia | Caregiver-burden benefit with more frequent sessions; symptom result not significant | Generalization to independent older adults or desktop avatars |

The [older-adult self-care framework](https://doi.org/10.1177/0018720820964085)
and [qualitative role research](https://doi.org/10.1007/s10796-026-10699-2)
support starting from function and desired relationship rather than
photorealism. The [robot fear review](https://doi.org/10.3389/frobt.2025.1626471)
includes uncanny appearance alongside privacy, autonomy and reliability
concerns; it is not evidence that every older adult dislikes realism.

Voice-primary must not mean voice-exclusive.
[W3C older-user guidance](https://www.w3.org/WAI/older-users/) and
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) support text/captions, typed
input, keyboard/touch controls, visible state and understandable
confirmation. A voice-only Star Trek metaphor can exclude people with
hearing or speech difficulties and imply monitoring that does not exist.

## Analysis

### Alternatives beyond Hy-Memory

The original synthesis underrepresented alternatives. The following
comparison supplements ADR 0005 rather than assuming every external system
must be adopted. These are architecture/project comparisons, not new matched
benchmarks or verified health deployments. Sources checked 2026-10-27.

| Approach | What is worth borrowing | Fit and adoption cost for Sodalis |
| --- | --- | --- |
| Plain long context / summary + RAG | Transparent baseline; little infrastructure; episodic evidence stays available | Keep as an evaluation baseline. Summaries lose detail, full context increases cost and disclosure, and neither supplies consent or temporal truth |
| [Mem0](https://arxiv.org/abs/2504.19413) | Extract/consolidate salient facts, reconcile updates, optional graph variant; explicit accuracy/cost tradeoffs | Strong replaceable-writer baseline. Its LoCoMo claims are not directly comparable to Sodalis's sampled harness; health consent, provenance/deletion and Dutch quality still need integration |
| [Zep/Graphiti](https://github.com/getzep/graphiti) | Temporal entity/relationship graphs, validity windows, episode provenance and historical queries | Strongest conceptual comparator for changing relationships and histories. Graphiti is a self-hosted framework requiring a graph backend and surrounding service; Zep is a separate managed/BYOC offering, not the same deployment |
| [MemGPT](https://arxiv.org/abs/2310.08560) / [current Letta](https://github.com/letta-ai/letta-code) | Explicit working/core versus archival memory, agent-managed context and background reflection | Strong comparator for persistent stateful agents, not merely a database. Current Letta includes local/server and TypeScript SDK paths; do not dismiss it as Python-only. Self-modifying prompts/skills and cross-agent access require tighter policy than Sodalis should grant by default |
| [A-MEM](https://arxiv.org/abs/2502.12110) | Zettelkasten-style notes, contextual tags, links and evolution as new evidence arrives | Useful for associative recall. Automatic rewriting/linking needs versioned provenance, deletion propagation and health-inference limits |
| [MemOS](https://arxiv.org/abs/2507.03724) | Memory lifecycle/scheduling, provenance/version metadata in MemCubes; separation of text, activation and parameter memory | Useful lifecycle vocabulary. Activation/parameter memory is a different ownership/erasure problem and outside the current provider-neutral SQLite slice; adopting the whole OS is not justified |
| [MIRIX](https://arxiv.org/abs/2507.07957) | Core, episodic, semantic, procedural, resource and vault memory, coordinated by specialists | Useful specialist-memory reference, but its screen-monitoring workflow conflicts with Sodalis's explicit-capability/no-arbitrary-DOM boundary. Do not copy ambient capture |
| [Cognee](https://github.com/topoteretes/cognee) | Local document/conversation ingestion into searchable knowledge graphs | Worth a document-grounding baseline, especially for selected letters/manuals. User-memory governance and task semantics remain Sodalis responsibilities; current local support should not be dismissed |
| [Supermemory local](https://supermemory.ai/docs/self-hosting/overview.md) | Embedded graph/hybrid retrieval, profiles, API and local OpenAI-compatible inference | A real local deployment option, not cloud-only. The server binary's codebase is non-public; telemetry, update checks, English-default embeddings and URL-ingestion transfers need deliberate configuration/review |

Memobase remains a candidate for profile/event-oriented memory, but its
current repository/implementation could not be reverified from the attempted
public links in this follow-up. Do not rank it from stale assumptions.
The same applies to treating model fine-tuning, a vector engine or a
generic GraphRAG package as a complete substitute for user-memory policy.

**Decision:** retain the current source-of-truth model and evaluate bounded
comparators behind existing ports. First compare Mem0-style writing,
Graphiti-style temporal queries and Letta-style context management on the
same Dutch histories, corrections, forgetting and action constraints.
Evaluate A-MEM/Cognee when associative document recall is the actual gap.
No framework switch is authorized or implied by this desk research.

### Would multiple specialists help Sodalis?

**Yes, selectively.** Multiple roles do not require multiple models, visible
personas or concurrent autonomous agents. Start with one conversational
orchestrator and a small set of typed, bounded tools/subflows:

| Request | Route | Reason |
| --- | --- | --- |
| Greeting, agenda, simple recall | Fast single-agent response plus deterministic retrieval | Low latency; avoid unnecessary coordination |
| Exact date, price or schedule calculation | Typed deterministic tool | More reliable and cheaper than LLM debate |
| Selected document / long personal history | Evidence-retrieval specialist | Retrieve source-scoped context and return citations, not a second biography |
| Wearable/numeric trend, if later approved | Sandboxed analysis specialist | Inspect data availability, execute reproducible computation, report uncertainty |
| Explain a health document | Separately governed knowledge-grounding subflow | Preserve source/clinical limits; no diagnosis or automatic treatment changes |
| Planning meals or a multi-step errand | Planner prepares a proposal | Independent runtime still owns confirmation and execution |

Use the **same governed memory service**, not separate private stores per
expert. Pass only purpose-permitted context and an immutable request; return
typed results with sources, uncertainty and failures. Specialists cannot
grant themselves tools, consent or write authority. A single validated path
should own durable memory commits.

Start with bounded sequential routing; parallelize only genuinely
independent subtasks where latency/quality measurements justify it.
Cap calls/time, support cancellation, surface partial failures, and retain
a deterministic policy/approval layer. Multiple agents sharing the same
model and evidence have correlated errors; agreement is not independent
verification. An LLM "safety expert" is not a substitute for code-enforced
permissions.

Validate one-agent versus routed-specialist variants with matched context,
models and budgets: task success, grounded factuality, privacy violations,
duplicate side effects, time-to-first-speech, total latency and user burden.
The Nature results motivate this experiment, not an always-on committee or
a demonstrated benefit for Sodalis. Implementing specialist orchestration
is future work, not part of the presentation controls requested here.

### Memory: deepen governance and correctness

Distinguish event time from recording time, speaker from subject, negation
from affirmation, a plan from an event, and user report from verified
clinical data or inference. A confidence number is not medical authority.
Use appropriate structured records and
[FHIR Provenance](https://www.hl7.org/fhir/provenance.html) at a future
clinical boundary, not a biography containing untyped measurements.

Keep capture, retention, task use, disclosure and action permission
separate. An allergy may constrain a meal recommendation without
disclosing the underlying diagnosis to a merchant. Memory consent is not
caregiver consent or permission to send health details.

DCPM's ethics discussion recommends per-layer opt-in and initially
disabled cross-domain core schemas. That differs from Sodalis's
top-level general/health consent policy. Do not treat generic memory
consent as an automatically justified mandate for deeper psychological
or cross-domain profiling; any such expansion needs an explicit policy
decision, inspectability and deletion.

Current code records raw turns before asynchronous health classification.
Dropping health-derived memories is not the same promise as never
retaining health words in transcripts. Transcript deletion leaves
derived items; retention can remove source links while derived claims
remain. Explain those semantics and choose how expired evidence,
derivatives, pending jobs and backups should behave.

The existing item-deletion mechanism already removes revisions/index
entries and handles evidence-dependent inferences. Extend and test it;
do not describe forgetting as entirely absent or complete.

### Actions: memory is not authority

A preference is not a plan; a plan is not a schedule; a schedule is not
evidence of completion; none is permission to spend money. Keep
confirmation in the trusted runtime, independent of model text.
Use narrow capabilities, idempotency, approval expiry/revalidation and
real execution receipts.

[Task 0044](../../TASKS/0044-propose-confirmed-actions.md) documents the
gap between talking about a confirmed action and actually proposing the
action that triggers the runtime. Solve that seam before claiming
reliable autonomous account operations.

Preserve the Aster iframe sandbox and `packages/desktop-host` boundary.
Imported apps, email and web content are untrusted evidence, not
instructions that can elevate privileges. Credentials belong outside
conversational memory.

### Embodiment: choose calibrated trust, not maximum attachment

Use a presentation boundary above the renderer, leaving memory,
permissions, providers and actions identical across forms. Abstract or
animal presentations need not satisfy the existing humanoid GLB rig.
Hiding WebGL is not by itself a complete no-character experience.

Keep existing human assets available; do not infer that this research
invalidates them. Treat photorealism as an optional evaluated preference,
not proven care quality. Realistic skin with poor motion/voice can
create expectation mismatch, while a restrained human may work well.

Identify the assistant as AI, avoid clinician/family impersonation,
guilt or dependency cues, and facilitate real human contact. A nurse-like
outfit can confer unwarranted authority. Physical animal companionship,
screen-avatar preference and clinical outcomes are different questions.

Preserve the [licensed-avatar procedure](../avatar/licensed-avatars.md).
Technical fidelity does not settle asset rights or older-user benefit.

## Limitations

- The search is a source-grounded synthesis, not an exhaustive,
  preregistered systematic review.
- No located older-adult experiment held the complete assistant constant
  while comparing all five requested visual forms.
- Intervention-package results, stated preference, trust, loneliness,
  adherence and clinical outcomes must not be conflated.
- Product claims are not independently reproduced benchmarks or security
  audits; availability/policies can change.
- Existing memory scores are synthetic or sampled; no new measurements
  or representative user validation were performed.
- Dutch language, cultural context, sensory differences, cognitive status
  and digital confidence require direct evaluation.
- Local-first storage is not automatically encrypted, secure or legally
  compliant. Production requirements need a defined-use-case assessment.

## Open items

1. Finish the plain-language memory explanation, consent and
   inspect/correct/delete UI in 0039; define complete forgetting scopes
   in [0053](../../TASKS/0053-memory-conversational-forget.md).
2. Resolve evaluation/runtime configuration equivalence; test exact
   temporal reasoning, stale/conflicting claims and reliable recall.
3. Measure preference/constraint application in tasks, attribution,
   evidence correctness, unauthorized disclosure/action, and reappearance
   after deletion, not just QA recall.
4. Deliver useful typed integrations with mocks first; real accounts,
   purchases and health data require separate approved work.
5. Co-design presentations with representative Dutch older adults, then
   compare matched voice/content/latency/controls and follow use beyond
   novelty. Predefine endpoints and sample size before efficacy claims.
6. Measure hardware and licensing/authoring costs for realistic avatars;
   keep 0054's pipeline work separate from claims about user benefit.
