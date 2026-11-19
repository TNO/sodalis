# 0095 Add the replay advance script

Status: open
Triage: ready-for-agent
Priority: medium
Subsystem: scripts
Spec: [0092](0092-home-simulator-mcp-spec.md)
Depends on: 0094 (stdio client wrapper, fake MCP fixture, session handoff file)

## Context

Spec stories 18–22. Notes for implementers:
`/home/al/.copilot/session-state/5881740b-0212-4c05-b922-b7cfcc84583d/files/notes/home-simulator-mcp.md`
(see "Batch paging and acknowledgement" and "Dataset ended").

## Acceptance Criteria

- Operator script `pnpm home-simulator:advance` (`tsx`): reads the session ID and
  state directory from the handoff written by 0094, starts its own avatar-role
  child bound to that session (a second reader on the same session is fine; state
  is shared via the state dir), and advances the replay to the next interaction:
  `next_interaction_batch`, follow `next_page_token` until `window_complete`,
  then `acknowledge_batch` with `memory_kind: "context"` and a deterministic
  `memory_checkpoint_id` (e.g. `sodalis-advance-<batch_id>`). Acknowledgement is
  a context checkpoint only; nothing is stored durably.
- Prints the new simulated time and the next interaction (time, person) when
  there is one.
- Dataset ended (`end_of_dataset` with no `events`/`batch_id`, or a final batch
  with `reason: "end_of_dataset"` after acknowledging it): prints a clear
  "dataset ended, nothing left to replay" and exits 0.
- Safe to repeat: a retry after a failure re-reads the pending batch from page 1
  and never acknowledges before all pages were read; re-acknowledging the same
  batch is idempotent. Reads all pages even when the batch has zero events.
- Clear error when no handoff exists (stack not up with the flag on) or the
  session is unknown.
- Not reachable from the assistant or the bridge (verified by the 0094 tests;
  do not add it to the bridge).
- Behaviour tests with the fake stdio MCP fixture: all pages read before
  acknowledge, ack failure then retry does not skip observations, repeated runs
  advance one interaction each, dataset-ended message, missing handoff error.
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm build`.
