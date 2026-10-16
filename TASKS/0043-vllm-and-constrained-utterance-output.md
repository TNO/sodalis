# 0043 Measuring vLLM and constrained utterance output

Status: open
Priority: low
Subsystem: assistant
Depends on: 0037

## Context

Task 0037 added the Azure OpenAI v1 provider and compared it with the host
Ollama `llama3.2:3b` baseline; see the
[LLM provider evaluation](../docs/evaluations/llm-providers.md). vLLM was
assessed from documentation only. The 3B local baseline returned valid JSON
but matched the utterance schema in only about half of its replies, because
`response_format: json_object` constrains syntax, not shape.

## Acceptance Criteria

- Measure vLLM through `LLM_PROVIDER=openai-compatible` with
  `scripts/llm-compare.ts` and `scripts/llm-live-check.ts`: the CPU image
  (`vllm/vllm-openai-cpu`, x86 AVX2/AVX-512) on a laptop, and a GPU host if
  available. Add a Compose profile only if a supported container works.
- Evaluate `json_schema` structured output for the utterance contract as an
  opt-in per provider, and measure schema validity and action correctness
  against `json_object` on the same prompt set.
- Document how strict mode changes the contract (every field required,
  `additionalProperties: false`, nullable optional fields, action arguments)
  before changing the parser or the system prompt.
- Keep the browser connected only to the Sodalis AI API, credentials
  server-side, and selection explicit with no fallback.
- Add the results to `docs/evaluations/llm-providers.md`.

## Implementation Notes

- Ollama, llama.cpp, vLLM, and Azure all document `json_schema` support; the
  differences are in schema-feature coverage and strictness.

## Agent Notes
