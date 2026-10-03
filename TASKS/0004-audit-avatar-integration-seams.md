# 0004 Auditing avatar integration seams

Status: done
Priority: high
Subsystem: avatar
Depends on: 0003
Owner: Copilot
Agent: current session

## Context

Before adding Three.js or TalkingHead, inspect the Phase 0 shell, project
instructions, ADRs, dependency setup, and avatar host lifecycle. Confirm the
current compatible TalkingHead 1.7.x API supports avatar-only integration
with an external renderer and update loop.

## Acceptance Criteria

- `AGENTS.md`, current avatar-host code, workspace configuration, and relevant
  ADRs are reviewed.
- Existing attention/target registries and lifecycle hooks are identified.
- Three.js and TalkingHead versions/API entry points are pinned based on
  compatibility evidence.
- Any material conflict or missing capability is recorded before broad edits.

## Implementation Notes

- Follow the attachment's implementation order, especially external-renderer
  and single-authoritative-loop requirements.
- Do not add final third-party avatar art without confirming its license.

## Agent Notes

- Reviewed `AGENTS.md`, `PRODUCT.md`, ADRs 0001–0003,
  `apps/desktop/src/main.ts` and styles, workspace manifests, `DesktopHost`, and
  the architecture notes. The avatar is currently a static placeholder;
  Mithril has no explicit removal lifecycle for it yet, so the scene component
  must own mount/dispose.
- No Three.js, TalkingHead, attention manager, or semantic target registry is
  present. Add only a minimal semantic registry for the lab when needed.
- npm registry reports `@met4citizen/talkinghead@1.7.0` as latest, MIT, with
  `three: ^0.180.0`; its npm `gitHead` is
  `6764a37d868d014f8fffce311dc018a3f9a0673d`. Pin TalkingHead 1.7.0 and
  Three.js 0.180.0 together.
- At that exact TalkingHead source commit, `avatarOnly: true` accepts
  Sodalis's `avatarOnlyScene` and `avatarOnlyCamera`; `start()` does not
  schedule RAF, and `animate(deltaMilliseconds)` updates avatar behavior
  without rendering. `dispose()` clears only its avatar in this mode. The
  upstream README Appendix H documents `head.animate(delta * 1000)` in the
  caller's renderer loop. This satisfies the single-loop requirement, with the
  explicit caveat that upstream labels avatar-only mode experimental.
- The source has no published TypeScript declarations in its package metadata,
  so the private adapter will need a narrow local declaration/shim.
- No model or license is approved; do not bundle an avatar until a compatible
  redistributable source is confirmed.
- References: npm metadata for
  [`@met4citizen/talkinghead@1.7.0`](https://registry.npmjs.org/@met4citizen%2Ftalkinghead),
  [pinned source](https://github.com/met4citizen/TalkingHead/tree/6764a37d868d014f8fffce311dc018a3f9a0673d),
  and its [avatar-only documentation](https://github.com/met4citizen/TalkingHead/blob/6764a37d868d014f8fffce311dc018a3f9a0673d/README.md).
- Audit complete; proceed to public contracts and contract tests in 0005.
