# 0037 Evaluating alternate LLM providers

Status: open
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

## Agent Notes

- Ollama, vLLM, and Azure are evaluation targets; integrate when their APIs
  satisfy the required streaming and structured-output behavior.
