# 0001 Establishing the Aster desktop foundation

Status: done
Priority: high
Subsystem: desktop
Depends on: none
Owner: Copilot
Agent: current session

## Context

The initial Sodalis implementation request defined a Phase 0 desktop slice:
pnpm/TypeScript, a browser desktop, a narrow host boundary, and an assistant/
avatar area. The supplied implementation spec is the source for product and
trust constraints.

## Acceptance Criteria

- A pnpm workspace and typed Mithril desktop app build.
- Aster is pinned and hosted behind a narrow `DesktopHost` adapter.
- The assistant/avatar placeholder is accessible and remains beside the
  desktop.
- Licensing, boundaries, and architectural decisions are recorded.

## Implementation Notes

- Commit: `50f1143` (`Build Sodalis desktop foundation`).
- Aster snapshot: upstream commit `c61c1d1db7fc8de4717becc2d0dab108512520a4`.
- Future voice, LLM, memory, Mail, and Home Assistant work stays out of Phase 0.

## Agent Notes

- Completed the pnpm/TypeScript workspace, Mithril + mithril-materialized
  desktop shell, `packages/desktop-host`, adapter tests, avatar placeholder,
  product brief, architecture map, and ADRs 0001–0003.
- The clean upstream Aster smoke suite passed 54 checks before the host denied
  the `pad.exe` fixture; see 0002 for the follow-up.
