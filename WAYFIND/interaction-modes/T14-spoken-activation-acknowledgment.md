---
title: Should hands-free activation include a spoken acknowledgment?
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: [T08-activation-and-listening-state-ux.md]
---

## Question

> Historical decision. Spoken activation acknowledgments are deferred with the
> entire hands-free rollout; current feedback stays unchanged. See
> [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

The user preferred a short chime for now but raised the possibility of replacing
it later with a spoken sentence. Should a spoken activation acknowledgment
replace or supplement the chime, and what wording would be clear without
becoming intrusive?

## Resolution

Decided with the user in two grilling rounds, judged against the rubric ([T07](T07-evaluation-rubric.md)) and the UX in [T08](T08-activation-and-listening-state-ux.md). Desk decision only: nothing was built or measured.

**Default and option.** The chime stays the default sound for hands-free activations. A spoken acknowledgment is an optional setting, off by default, that the user or a helper switches on or off in a plain-Dutch setting. Where that setting lives with the other switches is decided in [T16](T16-how-activation-modes-combine.md).

**Scope.** Only the wake word and the external trigger get a sound acknowledgment. Hold-to-talk (instant tactile and visual feedback) and avatar-initiated prompts (Sodalis already speaks, [T09](T09-avatar-initiated-prompt-policy.md)) are unchanged.

**Wording.** One fixed Dutch phrase, never varied: "Hallo, waarbij kan ik helpen?" It takes about 1.5 to 2 s to say, so the microphone opens that much later than with a short phrase. This is the user's choice over the shorter "Ik luister."
When enabled, the sentence replaces the chime: one sound per activation.

**Sequencing.** The visible listening card (T08) appears at once. The microphone starts capturing the user's speech only after the sentence ends; no talking over it. This avoids Sodalis hearing itself, since echo is unmeasured on the tablet ([T02](T02-open-mic-tablet-browser-limits.md)).

**When sound cannot play.** If the browser blocks audio without a prior gesture or the speaker is muted, the activation shows the visible listening card only: no retry, no fallback sound (same rule as T09's autoplay case).

**Evidence gaps for the decision document (not tasks):** the spoken variant was never heard, not even in the T08 prototype; the extra delay (sentence length on top of the roughly 2.7 s wake-word latency) is unmeasured; echo, wording and acceptance with older adults are untested; the tablet is unmeasured.
