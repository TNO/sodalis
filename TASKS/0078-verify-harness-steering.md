# 0078 Verify and complete harness steering/interruption behavior

Status: open
Priority: low
Subsystem: assistant
Depends on: 0070

## Context

The workflow has native steering and speech-stop behavior, but tool execution
can delay when steering is consumed. Verify the approved interaction scenarios
after a completed sensor journey; do not promise instantaneous tool preemption.
Reuse the existing speech-interruption and caption behavior from
[0023](0023-microphone-vad-and-barge-in.md) and
[0042](0042-live-stt-captions.md).

## Acceptance Criteria

- Exercise model-turn steering, steering while a tool is active, explicit
  cancellation, repeated input, late results, and playback interruption with
  deterministic behavior tests.
- Preserve the distinction between stopping playback and cancelling or
  steering server work. Late results must not resume stale speech or contaminate
  a later workflow.
- Measure or characterize the observed interruption behavior without asserting
  instant interruption of an active tool or inventing a latency target.
- Reuse existing tested speech, playback, and cancellation behavior; do not
  redo audio recording or microphone-capture work.
- Fix bounded regressions found and update the architecture with current
  behavior and remaining limits.

## Implementation Notes

This is a later interaction-quality task, blocked by the first completed
sensor journey rather than a prerequisite for sensor acceptance.
