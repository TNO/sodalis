# LLM provider evaluation (task 0037)

Status: complete, 2026-10-16. All measurements were taken on 2026-10-16.
Commands to reproduce them are in
[development-stack.md](../development-stack.md#compare-llm-providers).

## Summary and recommendation

- **Recommended for conversation: Azure gpt-5 at `minimal` reasoning.**
  `minimal` stays the default effort; the user preferred it because it is
  much faster at the same answer quality as higher efforts.
  - Every Azure reply was valid JSON that matched the utterance schema. It
    never added an action to a chat turn or invented one, and it chose the
    correct action in 90% of action turns.
  - At `minimal` a reply completes in a median 1.8 s for about $0.003.
  - Higher efforts did not choose actions more accurately (90–93%) but were
    2.6–8.5 times slower and 2–7 times more expensive.
- **The local baseline, Ollama `llama3.2:3b` on a laptop CPU, is not good
  enough for semantic actions.** Keep it as the offline development default,
  not as the quality target.
  - It returned valid JSON every time, but only 49% of replies matched the
    utterance schema.
  - It chose the correct action in 55% of action turns and attached an
    action to 47% of chat turns. It once claimed to have ordered a pizza it
    cannot order.
  - Replies are short, sometimes odd, with Dutch grammar errors, and take a
    median 18.5 s to finish.
- **Azure is supported as an explicit opt-in behind the Sodalis AI API.**
  `LLM_PROVIDER=azure` reuses the OpenAI-compatible streaming adapter with
  Azure's `api-key` header, the deployment name as `model`, and a validated
  `reasoning_effort`. Local and Azure settings can coexist in `.env`;
  switching changes only `LLM_PROVIDER` and restarts the stack. There is no
  automatic fallback, and the Azure key is blanked for the AI container when
  a local provider is selected.
- **The system prompt needs a fix for confirmed actions**
  ([task 0044](../../TASKS/0044-propose-confirmed-actions.md)). For "send a
  mail", gpt-5 at `low` and above (and once at `minimal`) asked the user to
  say "confirm send" instead of proposing `mail.send`, so the Sodalis
  confirmation flow never starts. All 7 of its misses at `low`–`high` are
  this case.
- **Measured cost:** the four Azure comparison runs (240 turns) cost $2.41
  at Data Zone list prices; with warm-ups and the live check, about $2.60.

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
  Foundry resource, deployment `gpt-5`, Data Zone EU), comparing all four
  reasoning efforts.
- **Measure the existing local baseline**: host Ollama with
  `llama3.2:3b`, the `.env.example` default.
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
  - *JSON valid*: the whole response parses as a JSON object.
  - *Schema valid*: a strict check of the utterance the system prompt asks
    for (non-empty `text`; `affect` with a known expression and in-range
    numbers; boolean `interruptible`; known `gesture`; an `action` that is
    available and whose arguments pass its input schema). Sodalis itself is
    lenient and fills defaults, so a schema-invalid reply can still be shown.
  - *Correct action*: the action that Sodalis's own parser would invoke
    matches the expected ID, passes the input schema, and has the expected
    argument values (strings case-insensitively; free text accepts any
    value). For chat turns this means no action at all.
  - *First text*: time until the caption can start (the first non-empty
    `text` prefix); *total*: time to the end of the stream.
  - *Tokens and cost*: from the provider's usage report
    (`stream_options.include_usage`); reasoning tokens are billed as output.
- **Live check:** `scripts/llm-live-check.ts` drives the running stack
  through the gateway: round trips, then five turns cancelled after their
  first chunk (one more than the AI service's capacity of four) and a
  recovery turn.
- **Hardware for local runs:** 13th Gen Intel Core i7-1355U laptop
  (10 cores, 12 threads, AVX2, no AVX-512), about 7 GiB RAM visible to
  Linux, CPU only. Ollama runs natively on the host.

## Results

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
| Reasoning control | `reasoning_effort` per model (docs); not sent | `--reasoning-effort` / `reasoning_effort` to the template (docs) | per reasoning parser (docs) | `reasoning_effort`, sent |
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

### Local baseline: Ollama `llama3.2:3b`

Measured 2026-10-16 with 60 turns (20 prompts × 3) after one warm-up, with
the AI service's system prompt and `json_object`.

| Measure | Result |
| --- | --- |
| Failures | 1/60 (one turn exceeded the 180 s timeout) |
| JSON valid | 59/59 (100%) |
| Utterance schema valid | 29/59 (49%) |
| Chat turns without an action | 16/30 (53%) |
| Correct action on action turns | 16/29 (55%) |
| First caption text, median / p90 | 1.4 s / 3.0 s |
| Complete reply, median / p90 | 18.5 s / 36.8 s |
| Mean tokens in / out | 1,091 / 98 |

- **Schema problems** (59 replies): `interruptible` missing (7), `affect`
  missing (6) or out of range (8), unknown gesture (3), and action
  `arguments` that are not an object (12), lack a required field (4), or
  contain unknown fields (3); two actions were malformed or unavailable.
- **Correct actions per prompt** (of 3): open app, light, and send mail 3;
  search 2/2 (one timeout), open mail, and fan 2; thermostat 1 (missing
  `entityId` twice); list mail 0 (`arguments` not an object), draft 0 (chose
  `mail.open-message`), unavailable request 0 (invented an action each
  time).
- **Spurious actions in chat** mostly open an app or list or search mail, for
  example after "Goedemorgen! Hoe gaat het met je?".
- **Examples** (repetition 1): "Goedemorgen! Ik gaat best goed." (grammar);
  for the pizza request, "Ik heb een pizza margherita besteld voor je" with
  `mail.open-message`, a false claim of success.

### Azure gpt-5 by reasoning effort

Measured 2026-10-16, deployment `gpt-5` (Data Zone Standard, EU), 60 turns
per effort after one warm-up, sequentially. Prices are the Azure retail list
prices for gpt-5 Data Zone (effective 2025-08-01): $1.375 per million input
tokens and $11 per million output tokens; reasoning tokens bill as output.

| Effort | Failures | JSON / schema valid | Chat without action | Correct action | First text median / p90 | Complete reply median / p90 | Mean tokens in / out (reasoning) | Cost per turn | Cost, 60 turns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `minimal` | 0 | 100% / 100% | 30/30 | 27/30 (90%) | 1.4 s / 1.7 s | 1.8 s / 4.3 s | 1,085 / 129 (0) | $0.0029 | $0.17 |
| `low` | 0 | 100% / 100% | 30/30 | 28/30 (93%) | 3.6 s / 5.1 s | 4.8 s / 7.0 s | 1,085 / 375 (230) | $0.0056 | $0.34 |
| `medium` | 0 | 100% / 100% | 30/30 | 27/30 (90%) | 9.4 s / 13.8 s | 10.2 s / 15.2 s | 1,085 / 889 (746) | $0.0113 | $0.68 |
| `high` | 0 | 100% / 100% | 30/30 | 28/30 (93%) | 15.4 s / 28.3 s | 15.6 s / 28.8 s | 1,085 / 1,712 (1,570) | $0.0203 | $1.22 |

- **Misses:** `low`–`high` missed only "send a mail" (7 of 9 turns), by
  listing the message and asking for "confirm send" without proposing
  `mail.send`. At `minimal`, the misses were one "send" proposed as
  `mail.create-draft`, one search and one fan request answered with a
  clarifying or confirming question instead of the action.
- **No invented actions:** for the pizza request, every effort explained
  that it cannot order and offered a draft or checklist instead.
- **Dutch:** natural and grammatical in the samples reviewed (for example
  "Goedemorgen! Met mij gaat het goed, dank je. Hoe gaat het met jou
  vandaag?"). Longer replies at `low` and above often use line-broken lists
  although the system prompt asks for no Markdown.
- **Streaming arrives in bursts:** the reply completes a median 0.2–0.7 s
  after the first chunk, consistent with Azure's default content filter
  releasing streamed output in batches. Time to first text is therefore
  close to the full reply time.

### Live check

| Provider | Round trips (first chunk / total) | Long reply | Cancelled after first chunk | Recovery |
| --- | --- | --- | --- | --- |
| Ollama `llama3.2:3b`, AI service on the host (no gateway) | 3/3 valid; 0.2–0.5 s / 12–20 s | 94 s uncancelled | 5/5, at 0.7–3.3 s | HTTP 200, 10 s |
| Azure gpt-5, `medium`, full Compose stack through the gateway | 3/3 valid; 3.2–5.8 s / 3.4–6.0 s | 14.3 s uncancelled (first chunk 10.6 s) | 5/5, at 8.6–13.2 s | HTTP 200, 5.6 s |

All five cancelled turns released their slot (one more than the capacity of
four). The recovery turn took a normal 10 s rather than waiting behind five
94 s replies, which indicates that Ollama stopped generating when Sodalis
closed the upstream connection. For Azure, the stack check confirmed that
the AI container received only the `AZURE_LLM_*` settings (local `LLM_*`
blanked) and that the speech container received none of them.

### Ratings

The user reviewed both `review.md` files and gave a qualitative assessment
instead of numeric ratings:

- **Azure gpt-5 `minimal`: preferred.** "Very fast, with the same answer
  quality as low or high. In a setting where you are conversing, speed is
  also an important factor, so that is preferred."
- **Azure gpt-5 `low`, `medium`, `high`:** same answer quality as `minimal`,
  but slower.
- **Local `llama3.2:3b`:** "made a lot of mistakes in expected tool calls.
  The answers were also very short and sometimes a bit weird."

## Analysis

- **The adapter contract holds for both targets.** Ollama and Azure both
  speak streamed Chat Completions with `json_object` and usage reporting, so
  one adapter serves both. Azure differs only in its header, URL, the
  deployment as `model`, and `reasoning_effort`, which the `azure`
  selection fixes and validates. vLLM and llama.cpp document the same
  surface, so they would also fit `openai-compatible`.
- **Quality, not compatibility, limits the local baseline.** `json_object`
  guarantees parseable JSON but not the utterance shape: half the 3B
  replies break the schema. Sodalis tolerates most of this (it fills affect
  defaults and drops actions without `arguments`), but wrong or invented
  actions reach the action runtime, which then depends on its own validation
  and confirmation. A stricter `json_schema` would fix the shape, not the
  choice of action.
- **Streaming hides little for speech.** The caption starts after about
  1.4 s locally, but Sodalis sends the complete reply to TTS, so speech
  starts only after the full reply, a median 18.5 s on this laptop.
- **gpt-5 removes the quality problem but not every latency problem.** It
  is schema-perfect and never invents actions, so `json_schema` is not
  needed for it. At `minimal` it is about 10 times faster than the local 3B
  model end to end (1.8 s versus 18.5 s median) on this laptop.
- **More reasoning buys nothing measurable here.** Action accuracy is flat
  from `minimal` to `high` (90–93%), while latency and cost rise steeply.
  Higher efforts also make replies longer and list-shaped, which suits a
  spoken avatar less. Keep `AZURE_LLM_REASONING_EFFORT=minimal`; the `.env`
  used for the stack check had `medium`, which costs about 8 s per turn.
- **The confirmation miss is a prompt contract issue, not a model issue.**
  The system prompt lists each action's `confirmationPhrase` and forbids
  claiming confirmation, so a careful model asks for confirmation itself.
  Telling the model to *propose* confirmed actions and let Sodalis ask should
  fix it for every provider; re-run the comparison after that change.
- **Cost is small for development use.** At `minimal`, 1,000 turns cost
  about $2.90 at Data Zone list prices.

## Limitations

- One prompt set of 20 synthetic Dutch turns with a fixture action list
  whose descriptions name the IDs; the live app sends less context.
- Sequential turns on one laptop; local timings depend on the CPU and
  memory pressure, Azure timings on network and service load.
- Cost uses the prices passed to the script and ignores cached-input
  discounts, so it is an upper bound.
- Cancellation is checked at the Sodalis API. For Ollama, the recovery
  timing shows upstream generation stops; for Azure, whether generation
  (and billing) stops on disconnect is not observable from outside, and the
  burst delivery means cancellation often lands after most of the reply was
  generated.
- Azure was measured from one location at one time of day, on one
  deployment; the subjective quality notes are from a sample of replies.
- The local live check ran against the AI service directly, without Compose
  and the gateway.
- The laptop had about 7 GiB of RAM and other workloads; one local turn
  timed out and timings vary widely (p90 is twice the median).
- vLLM is assessed from documentation only.

## Open items

- [Task 0044](../../TASKS/0044-propose-confirmed-actions.md): change the
  system prompt so the model proposes confirmed actions and Sodalis asks for
  confirmation, then re-run both comparisons.
- [Task 0043](../../TASKS/0043-vllm-and-constrained-utterance-output.md):
  measure vLLM (CPU image on x86 AVX2, or GPU) and evaluate `json_schema`
  output for local models.
- Entra ID (keyless) authentication for Azure is not implemented.
