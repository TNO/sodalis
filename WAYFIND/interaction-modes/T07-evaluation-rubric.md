---
title: Evaluation rubric, eagerness, missed activations, activation effort and privacy
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: [T06-prior-art-false-activations-older-adults.md]
---

## Question

How do we score each interaction mode? Fix concrete, measurable definitions
and acceptance thresholds for: eagerness (false activations per hour, and what
counts as irritating), missed activations, activation effort (steps and
retries needed), privacy (what audio is processed where before activation),
latency to a visible listening state, and power use. Decide the ordering and
which thresholds are hard gates, using the criteria order in the map's Notes
and the metrics found in the prior-art research.

## Resolution

Decided with the user in a three-round interview. Inputs: T05 (privacy), T06
(metrics and prior art), T02 (barge-in and power unknowns). All numbers are
nominal and provisional: there is no Dutch or older-adult data, and the only
tester is the user.

**Structure.** Hard gates first. Modes that pass are ranked in the map's
criteria order (privacy, false and missed activations, accessibility and
effort, latency). Ties on a criterion are decided by the next one. No weights.

**Definition.** An *activation* is the moment a turn starts: audio passes the
pre-activation stage or a visible listening state appears, whichever is first.
A *false activation* is any such moment the user did not intend, in every mode.
That covers TV, radio or conversation triggering a wake word, open-mic VAD on
speech not addressed to Sodalis, and an unwanted sensor-triggered or
avatar-initiated prompt (dismissed, or "not now"). Detections that never reach
a turn start are not counted.

**Gates (pass/fail).**

| Criterion | Gate | Target |
|---|---|---|
| Privacy, tier 1 (never consentable) | No pre-activation audio written to disk; false-activation audio discarded at once; no covert listening; listening state always visible with a one-touch mute | n/a |
| Privacy, tier 2 (consentable) | Allowed only with opt-in, plain-Dutch, revocable consent and a working alternative without it | none needed |
| Eagerness | at most 0.25 false activations per waking hour (16 h/day, about 4/day) | at most 0.06/h (about 1/day) |
| Missed activations | at least 80% of intended attempts succeed on the first try | at least 95% within one retry |

- Tier 2 items: pre-activation audio leaving the device, voice
  identification, longer buffer or retention. Cloud runs also need per-run
  consent under `AGENTS.md`. The OS microphone indicator is accepted as is.
- Open risks, recorded but not gated: whether the pre-activation buffer is
  GDPR "processing", and the likely DPIA for older adults (T05).
- Eagerness and missed activations are measured at the same detector setting,
  so one cannot be traded against the other. Missed-activation tests: Dutch
  phrases, a couple of distances and noise levels, tablet speaker silent and
  playing.

**Ranked only, no gate.**

- **Privacy burden**: the number and severity of tier-2 items the user must
  accept, plus the user's 3-point felt-intrusiveness rating (fine / uneasy /
  unacceptable). "Unacceptable" ranks the mode last on privacy and is recorded
  as an adoption risk. Rationale: users can consent but may refuse; perceived
  privacy decides adoption.
- **Activation effort**: deliberate actions (touch, spoken attempt, waiting
  after a prompt) from intent to visible listening state, retries included.
  Reference target: 0 touches and at most 1 spoken attempt at the median.
  There is no baseline (hold-to-talk as built is not usable in the real
  system). A yes/no flag records whether the mode needs hands, vision, or
  unusual speech.
- **Activation latency**: end of the trigger (wake word, touch, sensor event)
  to a visible and audible listening state. Lower is better; median 300 ms is
  a reference marker, not a pass/fail. First-reply time belongs to the
  STT/LLM/TTS pipeline and is out of this rubric.
- **Power**: reported only (CPU %, temperature after 1 h, battery drain per
  hour for handheld use). Assumes mains power; a mode that throttles or is
  killed by sleep or background rules already fails the other gates.

**Ties.** Two modes tie on a criterion if both meet its target. If both are
between target and gate, the lower rate wins only if it is less than half the
other's; otherwise they tie and the next criterion decides.

**Evidence.** No trials, soak hours, or sample-size targets: the user is the
only tester. Per prototyped mode the user does one short hands-on check: about
10 minutes of mixed TV, radio and conversation playback, plus about 20
intended Dutch attempts, then the felt-intrusiveness rating. Red flags (gate
fail unless explained): 2 or more false activations in the 10 minutes, or 5 or
more of 20 first attempts failing. A clean check means "no red flag", not that
a threshold is verified. Every cell in the comparison states its evidence
level: desk research, hands-on, or not measured. Modes not prototyped are
judged on desk research only. A real soak verifying the numbers is a follow-up
task for the modes implemented, not part of this evaluation.

Glossary updated: Eagerness, Pre-activation audio, Activation latency; Activation
effort refined.
