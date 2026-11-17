---
title: Follow-up task list and how the open items appear in the decision document
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

All activation decisions are made. What goes into the ordered follow-up list for `TASKS/`, and how does `docs/evaluations/interaction-modes.md` treat the items that remain open? Settle:

- The follow-up tasks and their order, drawn from the closed tickets: for example the wake-word implementation with enrolment ([T15](T15-wake-word-route.md)), the listening-state UX ([T08](T08-activation-and-listening-state-ux.md)), the settings section, mute and microphone-blocked states ([T16](T16-how-activation-modes-combine.md)), the server-to-browser push channel and the administrator's trigger setup ([T13](T13-prototype-external-trigger-push-channel.md)), the prompt scheduler with its silence rules and the tablet autoplay policy ([T09](T09-avatar-initiated-prompt-policy.md)), the optional spoken acknowledgment ([T14](T14-spoken-activation-acknowledgment.md)), and a real presence signal plus a soak before inferred-intent prompts. Which of these are tasks, which merge, and what order.
- How the document treats sensor-reasoned activation (desk research only, off until a soak) and the tablet-only unknowns (barge-in over the tablet speaker, power and thermals, microphone permission persistence, sleep and background rules): evidence gaps, a follow-up check on a real tablet, or both.
- What happens to the throwaway prototype and research branches and to the uncommitted `WAYFIND/` tracker and glossary changes once the document is written.

## Resolution

Decided with the user in two grilling rounds, judged against the rubric ([T07](T07-evaluation-rubric.md)) and the closed tickets. Desk decision only: nothing was built or measured.

**Follow-up tasks for `TASKS/`, in order** (numbers from the next free one when written, each with ADR 0006 behaviour tests, verified on a laptop):

1. Activation controller and listening state: the shared state machine, the card ([T08](T08-activation-and-listening-state-ux.md)), persistent one-touch mute, microphone-blocked banner, and the overlap rules ([T16](T16-how-activation-modes-combine.md)). Needs 0023 and 0020.
2. Sample-based wake word with enrolment and the "Activation" settings section ([T15](T15-wake-word-route.md), T16). Needs task 1.
3. Server-to-browser push channel and the administrator's trigger setup, with admin-token Home Assistant subscription, origin protection and administrator-only status ([T13](T13-prototype-external-trigger-push-channel.md)). Needs 0038. Tasks 2 and 3 can run in parallel.
4. Prompt scheduler: silence rules, dismissal rules, listening window, tablet autoplay policy ([T09](T09-avatar-initiated-prompt-policy.md)); reminder and named-event kinds only. Needs tasks 1 and 3.
5. Optional spoken acknowledgment ([T14](T14-spoken-activation-acknowledgment.md)). Needs task 2.
6. Privacy review before hands-free listening is switched on for real users ([T05](T05-privacy-and-consent-always-listening.md)): DPIA check, the wake-word buffer never stored or sent, consent and deletion of enrolment recordings. A checklist for a human reviewer, not legal advice. It blocks the real-user rollout of task 2, not its development.

**Sensor-reasoned activation and inferred-intent prompts.** No task. Desk research only; the document lists the missing presence signal, the prior-art accuracy of about 70-80% and the absence of older-adult data as evidence gaps, and names a real presence signal plus a trial period (glossary: Trial period) as future work. This drops the earlier "presence signal and soak" follow-up from [T09](T09-avatar-initiated-prompt-policy.md).

**Tablet-only unknowns.** No tablet is available. They appear as evidence gaps only, with no tablet acceptance criteria and no task. The document gets a "Future research on a tablet" list stating exactly what to measure: barge-in over the tablet speaker, playback false-activation rate, CPU, power and thermals over a full day, microphone permission persistence across restarts, and sleep and background behaviour. Each task notes that tablet deployment needs those measured first.

**Branches and tracker.** Keep the nine pushed research and prototype branches, never merged, cited by commit SHA in the document and deleted once the follow-up tasks are done. Move the T08 prototype commit `b80014e` to a new `prototype/activation-listening-state` branch so the evaluation PR carries only the document, the `TASKS/` entries and index, `GLOSSARY.md` and `WAYFIND/`. Commit `WAYFIND/` and `GLOSSARY.md` in that PR, delete `STATUS.md` at the end, and remove the local prototype and research worktrees.

**Glossary.** Added Trial period (avoid "soak").
