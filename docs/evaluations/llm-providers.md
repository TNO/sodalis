# LLM provider evaluation (task 0037)

Status: in progress, 2026-10-16. The Azure provider is implemented and the
local baseline is measured; the Azure comparison runs and the subjective
ratings are pending. Commands to reproduce the measurements are in
[development-stack.md](../development-stack.md#compare-llm-providers).

## Summary and recommendation

- **The local baseline, Ollama `llama3.2:3b` on a laptop CPU, is not good
  enough for semantic actions.** It returned valid JSON every time, but only
  49% of replies matched the utterance schema. It chose the correct action in
  55% of action turns and attached an action to 47% of plain chat turns.
  Replies take a median 18.5 s to finish. Its Dutch has grammar errors, and
  it once claimed to have ordered a pizza it cannot order.
  Keep it as the offline development default, not as the quality target.
- **Azure OpenAI v1 (Microsoft Foundry) is supported as an explicit opt-in.**
  `LLM_PROVIDER=azure` uses the existing OpenAI-compatible streaming adapter
  with Azure's `api-key` header, the deployment name as `model`, and a
  configurable `reasoning_effort` (default `minimal`). Local and Azure
  settings can coexist in `.env`; switching changes only `LLM_PROVIDER` and
  restarts the stack. There is no automatic fallback, and the Azure key is
  blanked for the AI container when a local provider is selected.
- **Azure results are pending.** The gpt-5 comparison at the four reasoning
  efforts, the live check, and the ratings will complete this evaluation.

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
| Streaming (SSE) | yes, measured | yes | yes (docs) | yes (docs) |
| `json_object` | yes, measured | yes (docs) | yes (docs) | yes (docs) |
| `json_schema` | yes (docs) | yes (docs) | yes (docs) | yes, strict mode (not used) |
| Usage in stream | yes, measured | not documented | yes (docs) | yes (docs) |
| Reasoning control | `reasoning_effort` per model (docs); not sent | `--reasoning-effort` / `reasoning_effort` to the template (docs) | per reasoning parser (docs) | `reasoning_effort`, sent |
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

Pending: run by the user with the Azure key (see
[development-stack.md](../development-stack.md#compare-llm-providers)).

### Live check

| Provider | Round trips (first chunk / total) | Long reply | Cancelled after first chunk | Recovery |
| --- | --- | --- | --- | --- |
| Ollama `llama3.2:3b`, AI service on the host (no gateway) | 3/3 valid; 0.2–0.5 s / 12–20 s | 94 s uncancelled | 5/5, at 0.7–3.3 s | HTTP 200, 10 s |
| Azure gpt-5 | Pending | | | |

All five cancelled turns released their slot (one more than the capacity of
four). The recovery turn took a normal 10 s rather than waiting behind five
94 s replies, which indicates that Ollama stopped generating when Sodalis
closed the upstream connection.

### Ratings

Pending: the user rates each configuration from the generated `review.md`.

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
- <!-- AZURE-ANALYSIS -->Azure analysis pending the gpt-5 runs.

## Limitations

- One prompt set of 20 synthetic Dutch turns with a fixture action list
  whose descriptions name the IDs; the live app sends less context.
- Sequential turns on one laptop; local timings depend on the CPU and
  memory pressure, Azure timings on network and service load.
- Cost uses the prices passed to the script and ignores cached-input
  discounts, so it is an upper bound.
- Cancellation is checked at the Sodalis API. For Ollama, the recovery
  timing shows upstream generation stops; for Azure, whether generation
  (and billing) stops on disconnect is not observable from outside.
- The local live check ran against the AI service directly, without Compose
  and the gateway.
- The laptop had about 7 GiB of RAM and other workloads; one local turn
  timed out and timings vary widely (p90 is twice the median).
- vLLM is assessed from documentation only.

## Open items

- Run the Azure comparison at the four reasoning efforts, with prices.
- Run the live check with `LLM_PROVIDER=azure` through the gateway.
- Rate each configuration from `review.md`.
- Follow-up task: measure vLLM (CPU image on x86 AVX2, or GPU), and decide
  on `json_schema` strict output if JSON validity is poor.
- Entra ID (keyless) authentication for Azure is not implemented.
