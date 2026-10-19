# LLM provider evaluation (task 0037)

Status: complete; updated 2026-10-19. The local and gpt-5 runs were measured
on 2026-10-16 and gpt-4.1-mini on 2026-10-19, all with the same harness,
prompt set, and system prompt. Commands to reproduce them are in
[development-stack.md](../development-stack.md#compare-llm-providers).

## Summary and recommendation

Six configurations were measured on the same 60 Dutch turns; the
[comparison table](#comparison-of-all-options) puts them side by side.

- **Default: Azure gpt-5 at `minimal` reasoning** stays the default. The user
  preferred it over higher efforts because it is much faster at the same
  answer quality, and the gpt-5 deployment passed the full-stack live check
  (run at `medium`).
- **Leading candidate to replace it: Azure gpt-4.1-mini.** On this prompt
  set it equals gpt-5 `minimal` on every scored quality measure: 100% valid
  JSON and schema, no actions in chat turns, no invented actions, and 90%
  correct actions. It is also faster (median 1.4 s versus 1.8 s; p90 1.9 s
  versus 4.3 s), about 4.8 times cheaper per turn ($0.0006 versus $0.0029),
  and gives replies that are less than half as long and never span several
  lines, which suits a spoken avatar. It describes its own abilities less
  precisely, has not yet had a user quality rating, and has not had a live
  stack check. Switching needs only `AZURE_LLM_DEPLOYMENT=gpt-4.1-mini` and
  `AZURE_LLM_REASONING_EFFORT=off`.
- **Higher gpt-5 efforts are not worth it.** `low`, `medium`, and `high`
  choose actions no more accurately (90–93%) but are 2.6–8.5 times slower and
  2–7 times more expensive than `minimal`.
- **The local baseline, Ollama `llama3.2:3b` on a laptop CPU, is not good
  enough for semantic actions.** Only 49% of its replies match the
  utterance schema. It chooses the right action in 55% of action turns,
  attaches an action to 47% of chat turns, and invents an action for a
  request it cannot fulfil. A reply takes a median 18.5 s. Keep it as the
  offline development default, not as the quality target.
- **Every option misses "send a mail"** in the same way, so the system
  prompt needs a fix
  ([task 0044](../../TASKS/0044-propose-confirmed-actions.md)). The models
  ask the user to say "confirm send" or propose a draft instead of proposing
  `mail.send`, so the Sodalis confirmation flow never starts.
- **Azure is an explicit opt-in behind the Sodalis AI API.**
  `LLM_PROVIDER=azure` reuses the OpenAI-compatible streaming adapter, with
  no automatic fallback between local and cloud providers.

## Comparison of all options

60 measured turns per option (20 prompts × 3), after one excluded warm-up.
Times are medians, with p90 after the slash. Costs are at Azure retail list
prices without cached-input discounts (see [Pricing](#pricing)).

| Measure | Local `llama3.2:3b` | gpt-5 `minimal` | gpt-5 `low` | gpt-5 `medium` | gpt-5 `high` | gpt-4.1-mini |
| --- | --- | --- | --- | --- | --- | --- |
| Runs on | Host Ollama, laptop CPU | Azure, Data Zone EU | Azure, Data Zone EU | Azure, Data Zone EU | Azure, Data Zone EU | Azure, same Foundry resource |
| Reasoning | none | `minimal` | `low` | `medium` | `high` | none (`off`) |
| Measured | 2026-10-16 | 2026-10-16 | 2026-10-16 | 2026-10-16 | 2026-10-16 | 2026-10-19 |
| Failed turns | 1/60 (timeout) | 0/60 | 0/60 | 0/60 | 0/60 | 0/60 |
| Valid JSON | 59/59 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) |
| Valid utterance schema | 29/59 (49%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) |
| Chat turns without an action | 16/30 (53%) | 30/30 (100%) | 30/30 (100%) | 30/30 (100%) | 30/30 (100%) | 30/30 (100%) |
| Correct action on action turns | 16/29 (55%) | 27/30 (90%) | 28/30 (93%) | 27/30 (90%) | 28/30 (93%) | 27/30 (90%) |
| Invented action for an unavailable request | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| First caption text | 1.4 s / 3.0 s | 1.4 s / 1.7 s | 3.6 s / 5.1 s | 9.4 s / 13.8 s | 15.4 s / 28.3 s | 1.0 s / 1.4 s |
| Complete reply | 18.5 s / 36.8 s | 1.8 s / 4.3 s | 4.8 s / 7.0 s | 10.2 s / 15.2 s | 15.6 s / 28.8 s | 1.4 s / 1.9 s |
| Mean reply length | 112 characters | 261 characters | 317 characters | 318 characters | 302 characters | 121 characters |
| Multi-line replies | 5/59 | 11/60 | 15/60 | 22/60 | 19/60 | 0/60 |
| Mean tokens in / out (of which reasoning) | 1,091 / 98 | 1,085 / 129 (0) | 1,085 / 375 (230) | 1,085 / 889 (746) | 1,085 / 1,712 (1,570) | 1,086 / 74 (0) |
| List price per 1M tokens in / out | none (local) | $1.375 / $11 | $1.375 / $11 | $1.375 / $11 | $1.375 / $11 | $0.44 / $1.76 (Data Zone, assumed) |
| Cost per turn | none (local) | $0.0029 | $0.0056 | $0.0113 | $0.0203 | $0.0006 |
| Cost per 1,000 turns | none (local) | $2.91 | $5.62 | $11.27 | $20.32 | $0.61 |
| Cost of the 60 measured turns | none (local) | $0.17 | $0.34 | $0.68 | $1.22 | $0.037 ($0.033–$0.040 by tier) |
| Live check through Sodalis | yes, AI service on host | not run | not run | yes, full stack | not run | not run |
| User assessment | many wrong actions; short, sometimes odd replies | preferred: fast, same quality | same quality, slower | same quality, slower | same quality, slower | not yet rated |

### Correct actions per prompt

Correct out of 3 repetitions; the wrong choice is in parentheses. For chat
prompts and the unavailable request, correct means no action.

| Prompt | Local `llama3.2:3b` | gpt-5 `minimal` | gpt-5 `low` | gpt-5 `medium` | gpt-5 `high` | gpt-4.1-mini |
| --- | --- | --- | --- | --- | --- | --- |
| Chat: greeting | 1 (open app) | 3 | 3 | 3 | 3 | 3 |
| Chat: introduction | 1 (open app) | 3 | 3 | 3 | 3 | 3 |
| Chat: loneliness | 2 (open app) | 3 | 3 | 3 | 3 | 3 |
| Chat: explain a heat pump | 2 (open app) | 3 | 3 | 3 | 3 | 3 |
| Chat: recipe | 0 (list or search mail) | 3 | 3 | 3 | 3 | 3 |
| Chat: weather | 1 (open app, thermostat) | 3 | 3 | 3 | 3 | 3 |
| Chat: joke | 3 | 3 | 3 | 3 | 3 | 3 |
| Chat: sleep advice | 3 | 3 | 3 | 3 | 3 | 3 |
| Chat: mail question | 1 (list or search mail) | 3 | 3 | 3 | 3 | 3 |
| Chat: two-turn follow-up | 2 (search mail) | 3 | 3 | 3 | 3 | 3 |
| List mail | 0 (malformed arguments) | 3 | 3 | 3 | 3 | 3 |
| Search mail | 2 (one timeout) | 2 (asked instead) | 3 | 3 | 3 | 3 |
| Open a message | 2 (no action) | 3 | 3 | 3 | 3 | 3 |
| Draft a mail | 0 (opened a message) | 3 | 3 | 3 | 3 | 3 |
| Send a mail | 3 | 2 (draft) | 1 (asked "confirm send") | 0 (asked "confirm send") | 1 (asked "confirm send") | 0 (draft) |
| Open an app | 3 | 3 | 3 | 3 | 3 | 3 |
| Turn on a light | 3 | 3 | 3 | 3 | 3 | 3 |
| Set fan speed | 2 (no action) | 2 (asked instead) | 3 | 3 | 3 | 3 |
| Set thermostat | 1 (missing `entityId`) | 3 | 3 | 3 | 3 | 3 |
| Unavailable: order pizza | 0 (invented action) | 3 | 3 | 3 | 3 | 3 |
| **Chat total** | **16/30** | **30/30** | **30/30** | **30/30** | **30/30** | **30/30** |
| **Action total** | **16/29** | **27/30** | **28/30** | **27/30** | **28/30** | **27/30** |

## Analysis

- **Every cloud option meets the output contract; the local model does
  not.** All five Azure configurations returned schema-valid utterances on
  every turn, never attached an action to chat, and never invented an
  action. `json_schema` strict mode is therefore not needed for them. The
  local 3B model always returns parseable JSON (`json_object` guarantees
  that) but breaks the utterance shape in half its replies. Sodalis tolerates
  most of that by filling affect defaults and dropping actions without
  `arguments`. Wrong or invented actions, however, reach the action runtime,
  which then depends on its own validation and confirmation.
- **Action accuracy does not separate the cloud options.** They score
  27–28 of 30, a difference of one turn. The misses differ in kind:
  - gpt-4.1-mini misses only "send a mail".
  - gpt-5 `minimal` misses one send, and asks a clarifying question once
    for search and once for fan.
  - gpt-5 `low` to `high` miss only send.
  The shared send miss is a prompt contract issue (see below), not a model
  difference.
- **Latency separates them clearly.** gpt-4.1-mini is the fastest and the
  most consistent: median 1.4 s, p90 1.9 s. gpt-5 `minimal` has a similar
  median of 1.8 s, but its p90 is 4.3 s. Each step up in reasoning effort
  adds seconds per turn, up to a median 15.6 s at `high`. The local model
  takes 18.5 s. The two Azure runs were three days apart, so the
  gpt-4.1-mini versus gpt-5 latency gap is indicative, not a paired
  measurement.
- **Streaming hides little for speech.** Sodalis sends the complete reply to
  TTS, so speech starts only after the whole reply. Azure releases streamed
  output in bursts: the reply completes a median 0.2–0.7 s after the first
  chunk, consistent with its default content filter. Locally the caption
  starts after 1.4 s, but speech waits for the full 18.5 s.
- **Reply length favours gpt-4.1-mini for a spoken avatar.** Its replies
  average 121 characters and are never multi-line. gpt-5 replies are more
  than twice as long (261–318 characters), and 18–37% span several lines,
  often as lists, although the system prompt asks for no Markdown. Shorter
  replies mean less text to synthesize and to listen to. Whether they are
  too terse is for the user to judge; the sampled replies were complete
  and grammatical. The brevity has a cost: gpt-4.1-mini describes its
  abilities less precisely than gpt-5 (see
  [observations](#observations-per-option)).
- **Cost is small for every cloud option, and gpt-4.1-mini is the
  cheapest.** It produces fewer output tokens at a lower rate, about $0.61
  per 1,000 turns against $2.91 for gpt-5 `minimal` and $20.32 for `high`.
  Input tokens are the same for every option (about 1,085 per turn, mostly
  the system prompt and action list), so for gpt-4.1-mini they make up most
  of the cost.
- **More reasoning buys nothing measurable here.** Action accuracy is flat
  from `minimal` to `high`, while latency, cost, and reply length grow.
  Keep `AZURE_LLM_REASONING_EFFORT=minimal` while gpt-5 is the default.
- **The confirmation miss is a prompt contract issue.** The system prompt
  lists each action's `confirmationPhrase` and forbids claiming
  confirmation. A careful model therefore asks for the phrase itself instead
  of proposing the action and letting Sodalis ask. Every option does this:
  - gpt-5 asked for "confirm send".
  - gpt-4.1-mini proposed `mail.create-draft` and asked whether to send it.
    Once, it said "Ik heb een conceptmail voor je gemaakt" before the draft
    action had run.
  [Task 0044](../../TASKS/0044-propose-confirmed-actions.md) should fix this
  for every provider.
- **The adapter contract holds for every target.** Ollama and Azure both
  speak streamed Chat Completions with `json_object` and usage reporting, so
  one adapter serves both. Azure differs only in its header, URL, the
  deployment as `model`, and `reasoning_effort`; `off` omits that field for
  non-reasoning deployments such as gpt-4.1-mini. vLLM and llama.cpp document
  the same surface, so they would also fit `openai-compatible`.

## Scope

Task 0037 asks whether Ollama, vLLM, and Azure LLM backends can serve the
Sodalis AI provider contract:

- the browser talks only to the Sodalis AI API; providers sit behind
  server-side adapters, with credentials kept server-side;
- streamed text, the structured utterance (caption text, affect, gesture,
  optional semantic action), and cancellation;
- explicit selection, with no silent local-to-cloud fallback.

With the user, the scope was set to:

- **Integrate and measure Azure** (Azure OpenAI v1 API through a Microsoft
  Foundry resource): deployment `gpt-5` (Data Zone EU) at all four reasoning
  efforts, and, as a follow-up, the non-reasoning deployment
  `gpt-4.1-mini` with reasoning effort `off`.
- **Measure the existing local baseline**: host Ollama with `llama3.2:3b`,
  the `.env.example` default.
- **Document vLLM from its documentation only**; it is not run here.
- **Keep `response_format: json_object`** for every provider, and measure
  how often responses are valid JSON and match the utterance schema.
  Switching to `json_schema` strict mode would change the utterance contract
  (strict mode makes every field required and forbids free-form action
  arguments), so it is a follow-up if validity is poor.

Persistent memory is out of scope (task 0037 Implementation Notes).

## Method and hardware

- **Prompt set:** `scripts/llm-prompts.json`, 20 fixed Dutch user turns.
  - 10 chat turns (greeting, introduction, loneliness, explanation, recipe,
    weather, joke, sleep advice, a mail question, and a two-turn follow-up),
    where the correct behaviour is to answer **without** an action.
  - 10 action turns: list, search, open, draft, and send mail; open an app;
    turn on a light; set a fan speed; set the thermostat; and an unavailable
    request (ordering pizza), where the correct behaviour is no action.
  - Every turn gets the same 10-action list, shaped like the real Mail,
    desktop, and Home actions. Unlike the live app, the fixture names the
    message, app, and entity IDs in the action descriptions, so a model can
    choose arguments without other context.
- **Harness:** `scripts/llm-compare.ts` calls each provider in-process
  through `createLlmProvider`, the same factory and system prompt as the AI
  service. One excluded warm-up per configuration, then 3 passes over the 20
  prompts (60 turns per configuration), sequentially.
- **Scoring per turn:**
  - *Valid JSON*: the whole response parses as a JSON object.
  - *Valid utterance schema*: a strict check of the utterance the system
    prompt asks for (non-empty `text`; `affect` with a known expression and
    in-range numbers; boolean `interruptible`; known `gesture`; an `action`
    that is available and whose arguments pass its input schema). Sodalis
    itself is lenient and fills defaults, so a schema-invalid reply can still
    be shown.
  - *Correct action*: the action that Sodalis's own parser would invoke
    matches the expected ID, passes the input schema, and has the expected
    argument values (strings case-insensitively; free text accepts any
    value). For chat turns and the unavailable request this means no action.
  - *First caption text*: time until the caption can start (the first
    non-empty `text` prefix); *complete reply*: time to the end of the
    stream.
  - *Tokens*: from the provider's usage report
    (`stream_options.include_usage`).
  - *Reply length* and *multi-line replies*: computed afterward from the
    stored captions of all successful turns.
- **Live check:** `scripts/llm-live-check.ts` drives the running stack
  through the gateway: round trips, then five turns cancelled after their
  first chunk (one more than the AI service's capacity of four) and a
  recovery turn.
- **Hardware for local runs:** 13th Gen Intel Core i7-1355U laptop
  (10 cores, 12 threads, AVX2, no AVX-512), about 7 GiB RAM visible to
  Linux, CPU only. Ollama runs natively on the host.
- **Raw results** (ignored, in `models/llm-eval/`): `local-llama3.2-3b/`,
  `azure-gpt-5/`, and `azure-gpt-4.1-mini-off/`, each with `results.json`,
  `summary.md`, and `review.md`.

### Pricing

Cost is the recorded tokens × Azure retail list prices in USD; reasoning
tokens bill as output. It ignores cached-input discounts, so it is an upper
bound for the given tier, and it excludes warm-ups.

| Model | Tier used | Input per 1M | Output per 1M | Other tiers per 1M (in / out) |
| --- | --- | --- | --- | --- |
| gpt-5 | Data Zone Standard (the deployment's tier) | $1.375 | $11.00 | – |
| gpt-4.1-mini | Data Zone Standard (assumed; tier not recorded) | $0.44 | $1.76 | Global $0.40 / $1.60; Regional $0.484 / $1.936 |

- gpt-5 prices (effective 2025-08-01) were passed to the harness during the
  run.
- gpt-4.1-mini prices (effective 2025-04-01) were applied afterward with
  `--rescore`:
  - 65,139 input × $0.44/M + 4,465 output × $1.76/M = $0.0365.
  - At Global rates, the same run costs $0.033; at Regional rates, $0.040.
- Sources: the
  [Azure OpenAI pricing page](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)
  and Microsoft's
  [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices).
- Actual subscription charges can differ with region, cached tokens,
  negotiated rates, and billing adjustments.
- All gpt-5 comparison runs (240 turns) cost $2.41. With warm-ups and the
  live check, the gpt-5 work cost about $2.60.

## Detailed results

### Compatibility matrix

| | Host Ollama | Compose llama.cpp (`llm` profile) | vLLM | Azure OpenAI v1 |
| --- | --- | --- | --- | --- |
| Sodalis selection | `openai-compatible` | `openai-compatible`, blank `LLM_BASE_URL` | `openai-compatible` (not run) | `azure` |
| Endpoint | `http://<host>:11434/v1/chat/completions` | `http://llm:8080/v1/chat/completions` | `/v1/chat/completions` | `https://<resource>.openai.azure.com/openai/v1/chat/completions` |
| Auth | none (key ignored) | optional `--api-key`, Bearer | optional `--api-key`, Bearer | `api-key` header |
| Streaming (SSE) | yes, measured | yes | yes (docs) | yes, measured (arrives in bursts) |
| `json_object` | yes, measured | yes (docs) | yes (docs) | yes, measured |
| `json_schema` | yes (docs) | yes (docs) | yes (docs) | yes, strict mode (not used) |
| Usage in stream | yes, measured | not documented | yes (docs) | yes, measured (incl. reasoning) |
| Reasoning control | `reasoning_effort` per model (docs); not sent | `--reasoning-effort` / `reasoning_effort` to the template (docs) | per reasoning parser (docs) | `reasoning_effort`, sent; omitted with `off` |
| Cancellation | stops generating on disconnect, measured | not measured | not verified | Sodalis cancels, measured; upstream stop not observable |
| Container | host install (example) | `ghcr.io/ggml-org/llama.cpp:server` | `vllm/vllm-openai` (GPU) or `vllm/vllm-openai-cpu` (x86 AVX2/AVX-512) | cloud |

Sources: Ollama
[OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility);
llama.cpp
[server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md);
vLLM
[OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html),
[structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs.html),
and [CPU installation](https://docs.vllm.ai/en/latest/getting_started/installation/cpu.html);
Azure
[v1 API](https://learn.microsoft.com/azure/foundry/openai/api-version-lifecycle).

### Observations per option

- **Local `llama3.2:3b`**
  - Schema problems in 59 replies:
    - `interruptible` missing (7);
    - `affect` missing (6) or out of range (8);
    - unknown gesture (3);
    - action `arguments` that are not an object (12), lack a required field
      (4), or contain unknown fields (3);
    - two actions malformed or unavailable.
  - Spurious actions in chat mostly open an app or list or search mail,
    for example after "Goedemorgen! Hoe gaat het met je?".
  - Dutch has grammar errors, for example "Goedemorgen! Ik gaat best goed."
  - For the pizza request it said "Ik heb een pizza margherita besteld voor
    je" with `mail.open-message`, a false claim of success.
- **gpt-5, all efforts**
  - Dutch is natural and grammatical, for example "Goedemorgen! Met mij gaat
    het goed, dank je. Hoe gaat het met jou vandaag?".
  - For the pizza request, every effort explained that it cannot order and
    offered a draft or checklist instead.
  - Replies at `low` and above are longer and more often line-broken lists.
  - Introductions list exactly the available actions, such as opening
    Calculator, Notes, Calendar, or Mail.
- **gpt-4.1-mini**
  - Dutch is concise and grammatical, for example "Goedemorgen! Met mij gaat
    het goed, dank je. Hoe kan ik je vandaag helpen?".
  - Action replies are one short sentence, such as "Ik open de rekenmachine
    voor je."
  - It said that it cannot fetch current weather and that it cannot place
    the pizza order, offering to find a pizzeria or draft a mail instead.
  - In 2 of 3 introductions it described its abilities loosely: "je agenda
    beheren" (managing a calendar), and once also making notes and checking
    the weather. It can only open the Calendar and Notes apps and has no
    weather action. gpt-5 listed exactly the available actions.

### Live check

| Provider | Round trips (first chunk / total) | Long reply | Cancelled after first chunk | Recovery |
| --- | --- | --- | --- | --- |
| Ollama `llama3.2:3b`, AI service on the host (no gateway) | 3/3 valid; 0.2–0.5 s / 12–20 s | 94 s uncancelled | 5/5, at 0.7–3.3 s | HTTP 200, 10 s |
| Azure gpt-5 `medium`, full Compose stack through the gateway | 3/3 valid; 3.2–5.8 s / 3.4–6.0 s | 14.3 s uncancelled (first chunk 10.6 s) | 5/5, at 8.6–13.2 s | HTTP 200, 5.6 s |

- All five cancelled turns released their slot (one more than the
  capacity of four).
- The Ollama recovery turn took a normal 10 s rather than waiting behind
  five 94 s replies. This indicates that Ollama stopped generating when
  Sodalis closed the upstream connection.
- For Azure, the stack check confirmed that the AI container received only
  the `AZURE_LLM_*` settings (local `LLM_*` blanked) and that the speech
  container received none of them.
- The `.env` used for the stack check had `medium` selected, which adds
  about 8 s per turn over `minimal`.
- gpt-4.1-mini uses the same `azure` adapter and has not had a live check.

### User assessment

The user reviewed the `review.md` files of the 2026-10-16 runs and gave a
qualitative assessment instead of numeric ratings:

- **gpt-5 `minimal`: preferred.** "Very fast, with the same answer quality
  as low or high. In a setting where you are conversing, speed is also an
  important factor, so that is preferred."
- **gpt-5 `low`, `medium`, `high`:** same answer quality as `minimal`, but
  slower.
- **Local `llama3.2:3b`:** "made a lot of mistakes in expected tool calls.
  The answers were also very short and sometimes a bit weird."
- **gpt-4.1-mini:** not yet rated; its `review.md` is ready in
  `models/llm-eval/azure-gpt-4.1-mini-off/`.

## Limitations

- One prompt set of 20 synthetic Dutch turns, with a fixture action list
  whose descriptions name the IDs; the live app sends less context.
- 60 turns per option: differences of one or two turns are within noise.
- Sequential turns from one laptop. Local timings depend on the CPU and
  memory pressure; Azure timings depend on network and service load and were
  measured once per model, on two different dates.
- Costs are list-price estimates without cached-input discounts, not
  invoice totals. The gpt-4.1-mini deployment tier was not recorded, so its
  cost assumes Data Zone Standard; other tiers give $0.033–$0.040 for the
  run.
- Reply length and quality notes come from the stored captions and a sample
  of reviewed replies; gpt-4.1-mini has no user rating yet.
- Cancellation is checked at the Sodalis API. For Ollama, the recovery
  timing shows that upstream generation stops. For Azure, whether generation
  (and billing) stops on disconnect is not observable from outside, and
  burst delivery means cancellation often lands after most of the reply was
  generated.
- The local live check ran against the AI service directly, without Compose
  and the gateway; only gpt-5 `medium` had a full-stack check.
- The laptop had about 7 GiB of RAM and other workloads; one local turn
  timed out, and local timings vary widely (p90 is twice the median).
- vLLM is assessed from documentation only.

## Open items

- Rate gpt-4.1-mini in its `review.md` and run the live check with it
  through the stack; if the user accepts its reply style, make it the
  default Azure deployment.
- [Task 0044](../../TASKS/0044-propose-confirmed-actions.md): change the
  system prompt so the model proposes confirmed actions and Sodalis asks for
  confirmation. Then re-run the comparison for the local model, gpt-5
  `minimal`, and gpt-4.1-mini.
- [Task 0043](../../TASKS/0043-vllm-and-constrained-utterance-output.md):
  measure vLLM (CPU image on x86 AVX2, or GPU) and evaluate `json_schema`
  output for local models.
- Entra ID (keyless) authentication for Azure is not implemented.
