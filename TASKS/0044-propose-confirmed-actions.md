# 0044 Letting the model propose confirmed actions

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0037

## Context

The [LLM provider evaluation](../docs/evaluations/llm-providers.md) found
that Azure gpt-5, asked to send a mail, lists the message and tells the user
to say "confirm send" instead of proposing `mail.send`. The Sodalis action
runtime only asks for confirmation after the model proposes the action, so
the send never starts. This caused all seven of gpt-5's misses at `low`,
`medium`, and `high` reasoning effort. The shared system prompt in
`OpenAiCompatibleLlmProvider` lists each action's `confirmationPhrase` and
forbids claiming confirmation, which leads a careful model to run the
confirmation itself.

## Acceptance Criteria

- Change the system prompt so the model proposes actions that require
  confirmation and leaves the confirmation question to Sodalis, without ever
  claiming that the user confirmed or that the action succeeded.
- Keep the confirmation phrase and the runtime's confirmation flow
  unchanged, and keep one prompt for every provider.
- Add a behaviour test at the provider seam for the new prompt instruction.
- Re-run `scripts/llm-compare.ts` for Azure `minimal` and the local baseline,
  and update the evaluation with the effect on "send a mail" and on the
  other prompts.

## Implementation Notes

- Measured before the change: "send a mail" correct in 2/3 turns at
  `minimal`, 0–1/3 at `low`, `medium`, and `high`; local `llama3.2:3b`
  proposed `mail.send` in 3/3 turns.

## Agent Notes
