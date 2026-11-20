# ADR 0010: Use deliberate button activation, not a wake word

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** the activation recommendations in the
  [interaction-modes evaluation](../evaluations/interaction-modes.md) and
  [spec 0091](../../TASKS/0091-hands-free-activation-spec.md).

## Context

The earlier evaluation recommended a locally processed, sample-based wake
word. An always-listening device in the home can still feel intrusive even
when its pre-activation audio is only buffered locally. Local detection does
not prove intent: a false activation can send subsequent speech to configured
STT and text onward to an LLM. Missed or delayed detections also make the
trigger uncertain and frustrating. The limited laptop evidence did not settle
false-activation rates or recognition reliability.

## Decision

Keep the current tablet UI unchanged: the existing hold-to-talk control starts
listening, and typing remains available. Do not add a wake-word detector,
enrolment, activation settings, or background listening while waiting for a
trigger. This does not change the existing active-turn VAD or barge-in behavior.

The future activation direction is a deliberate press on a physical button.
No hardware or integration is selected yet. In particular, Home Assistant,
a server-to-browser push channel, button press/hold semantics, listening
duration, and microphone placement remain undecided. A microphone on an
embedded device could eventually extend Sodalis beyond the tablet; it is an
option to investigate, not an approved implementation.

Defer the entire hands-free rollout, including its shared controller and
listening UI, automatic avatar prompts, and spoken activation acknowledgment.
Wake-word work is out of scope, not an off-by-default feature to ship.

## Consequences

- Preserve the evaluation and Wayfind tickets as historical evidence, clearly
  marked as superseded. Tasks 0085-0091 no longer authorize implementation.
- Wake-word prototypes are historical research, not supported product features
  or an active implementation plan.
- Re-scope physical-button work before implementation, covering hardware,
  transport, capture location, listening lifecycle, feedback, failure handling,
  privacy and behavior tests. The old push-channel task is not a selected design.
- This decision does not waive privacy review for current speech/LLM processing
  or a future button device, and does not claim that button use makes cloud
  processing private.
