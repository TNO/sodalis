# 0031 Adding the Sodalis AI provider facade

Status: done
Priority: high
Subsystem: assistant
Depends on: 0029

## Context

The Sodalis AI service must remain the browser's LLM boundary and future home
for memory. It must not be replaced by a direct browser connection to Ollama,
vLLM, Azure, or another model API. LLM selection must be explicit and
independent of STT and TTS.

## Acceptance Criteria

- Configure an explicit LLM provider within the Sodalis AI service.
- Retain the existing OpenAI Chat Completions-compatible provider.
- Add a deterministic mock generation provider for development and tests.
- Support configured local, remote, and cloud endpoints through server-side
  adapters; keep all credentials out of browser requests and bundles.
- Require explicit provider configuration; do not silently select or fail
  over to a cloud provider.
- Keep streamed response, cancellation, semantic utterance validation, and
  semantic action discovery behavior intact.
- Keep an internal extension seam for memory without implementing memory in
  this task.
- Test missing, invalid, unavailable, and explicitly selected providers.

## Implementation Notes

- Ollama, vLLM, and Azure-specific adapters are evaluated in task `0037`.
- The Sodalis API and service boundary are established by task `0029`.
- Compose provider selection is in task `0034`.

## Agent Notes

- The LLM service is a Sodalis-owned product boundary. Provider selection
  changes its backend, not the browser's endpoint.
- 2026-10-04 Copilot: Added explicit AI provider selection with deterministic
  semantic mock and existing OpenAI-compatible streaming adapter, validated
  URL/model settings and preserved the service-owned generation seam. Verified
  3 new selection tests plus existing unavailable-provider tests and server
  typecheck; provider-specific Azure/Ollama/vLLM protocols await 0037.
