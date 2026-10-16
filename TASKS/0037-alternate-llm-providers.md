# 0037 Evaluating alternate LLM providers

Status: in_progress
Priority: medium
Subsystem: assistant
Depends on: 0031, 0034

## Context

The Sodalis AI service must remain in the request path so future memory,
semantic actions, and policy stay under Sodalis control. Evaluate local
Ollama/vLLM and Azure LLM backends as replaceable implementations behind that
service.

## Acceptance Criteria

- Verify Ollama, vLLM, and Azure LLM endpoint/auth/streaming/structured-output
  compatibility with the Sodalis AI provider contract.
- Integrate compatible targets through server-side adapters; keep the browser
  connected only to the Sodalis AI API.
- Add selectable local Compose profiles where a target has a suitable
  supported container, and explicit external configuration for cloud or
  remote backends.
- Keep credentials server-side and require explicit selection; no silent
  local-to-cloud fallback.
- Preserve semantic action discovery, structured utterance validation,
  cancellation, and future memory integration.
- Add provider tests and a compatibility/configuration matrix; document
  incompatibilities instead of faking support.

## Implementation Notes

- The existing OpenAI-compatible adapter is retained by task `0031`.
- This task does not implement persistent memory.
- Write the final, consolidated analysis in
  `docs/evaluations/llm-providers.md` (see `docs/evaluations/README.md`).

## Agent Notes

- Ollama, vLLM, and Azure are evaluation targets; integrate when their APIs
  satisfy the required streaming and structured-output behavior.
- 2026-10-16 Copilot: Added `LLM_PROVIDER=azure` (Azure OpenAI v1 through a
  Microsoft Foundry resource) on the existing OpenAI-compatible adapter:
  `api-key` header, deployment as `model`, configurable `reasoning_effort`
  (default `minimal`), optional usage reporting, and content-filter errors.
  Local and Azure settings coexist; only `LLM_PROVIDER` selects, the
  unselected provider's settings are blanked for the AI container, and there
  is no fallback. Tests use injected fetch only and never call Azure.
- 2026-10-16 Copilot: Added `scripts/llm-compare.ts` (20 fixed Dutch turns ×
  3, latency, JSON/schema validity, action correctness, tokens, cost,
  `review.md` for ratings, `--rescore`) and `scripts/llm-live-check.ts`
  (round trips and cancellation through the gateway). Measured the host
  Ollama `llama3.2:3b` baseline on the laptop CPU. Azure gpt-5 at the four
  reasoning efforts, its live check, and the ratings are pending the user's
  key. Analysis: [LLM provider evaluation](../docs/evaluations/llm-providers.md).
- vLLM publishes a CPU image (`vllm/vllm-openai-cpu`, x86 AVX2/AVX-512), so
  it need not wait for a GPU; it remains documentation-only here.
