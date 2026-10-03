# 0007 Integrating the Sodalis-owned Three.js scene

Status: done
Priority: high
Subsystem: frontend
Depends on: 0006
Owner: Copilot
Agent: current session

## Context

Sodalis owns the persistent avatar layer's Three.js scene, renderer, camera,
lights, resize handling, quality/DPR policy, context lifecycle, and sole render
loop. The avatar must remain beside the desktop and survive app launches.

## Acceptance Criteria

- One Sodalis-owned `Scene`, `WebGLRenderer`, camera, and animation loop render
  the avatar.
- The avatar layer is persistent, transparent/composited, responsive, and does
  not reload when Aster opens applications.
- Host lifecycle handles resize, visibility changes, and renderer failures
  without blocking the rest of the desktop.
- Pointer events pass through outside actual interactive regions.

## Implementation Notes

- Integrate with the existing avatar host rather than creating an isolated
  TalkingHead widget.
- Computed framing uses model bounds/head reference, with per-asset overrides.

## Agent Notes

- Started after 0006 completed the adapter and confirmed the single external
  update-loop API.
- Integrate the scene host into the existing Mithril assistant panel without
  reloading the Aster iframe. The canvas host owns all renderer/lifecycle
  resources; avatar failure remains non-blocking.
- Implemented the persistent Sodalis-owned scene, renderer, camera, resize and
  visibility handling, context-loss reporting, and single update/render loop.
- Added the Mithril viewport to the assistant panel. The scene is loaded on
  demand, disposed on removal, and reports missing-model/WebGL failures without
  blocking Aster.
- Validation: `pnpm test`, `pnpm typecheck`, `pnpm build`, and
  `git diff --check` passed. Browser verification confirmed the scene mounts,
  resizes, and remains mounted while an Aster application is opened; no
  browser console errors were reported.
- The production bundle keeps the avatar scene in a lazy chunk. Its size still
  exceeds Vite's 500 kB warning threshold because it includes Three.js; initial
  desktop loading remains split from that chunk.
