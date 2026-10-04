# 0035 Evaluating alternate STT providers

Status: open
Priority: medium
Subsystem: speech
Depends on: 0030, 0034

## Context

Once independent speech provider selection and Compose profiles are in place,
evaluate Cactus and Azure AI Speech as alternate STT implementations without
changing the Sodalis browser contract.

## Acceptance Criteria

- Evaluate Cactus and Azure AI Speech against the Sodalis STT contract,
  including Dutch support, streaming/partial behavior, cancellation,
  latency, licensing, and Windows/Linux/macOS deployment.
- Integrate each target that can meet the contract through a Sodalis-owned
  adapter; never let the browser call the engine or Azure directly.
- Add a selectable Compose profile for a compatible local container and
  explicit server-side configuration for a cloud/external provider.
- Preserve explicit provider selection and prohibit silent cloud fallback.
- Add adapter tests and a documented compatibility/configuration matrix.
- For any target that cannot meet the contract, document the verified
  limitation and do not claim unsupported capabilities.

## Implementation Notes

- The current Whisper.cpp path remains available.
- STT selection is established in task `0030`; the development Compose stack
  is established in task `0034`.

## Agent Notes

- Cactus and Azure AI Speech are evaluation targets; integrate when they meet
  the provider contract and platform constraints.
