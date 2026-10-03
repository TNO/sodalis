# ADR 0004: Separate avatar behavior, rendering, and asset approval

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Phase 1 needs a testable avatar behavior surface and a browser-rendered
prototype without making an unreviewed model, renderer lifecycle, or authoring
tool part of the desktop host contract. The TalkingHead brunette example has
verified source and non-commercial licensing, but it is not approved for
commercial use.

## Decision

Keep the avatar behavior controller in `@sodalis/avatar`, with TalkingHead
behind its adapter. Sodalis owns the Three.js scene, camera, render loop,
quality limits, lifecycle, and model validation; the desktop lazily loads that
scene. Keep the Avatar Lab development-only. Define the supported GLB profile
and validation checks in
[`docs/avatar/SODALIS_AVATAR_PROFILE.md`](../avatar/SODALIS_AVATAR_PROFILE.md).
The user selected the TalkingHead v1.7.0 brunette example as a non-commercial
pipeline smoke test. Bundle it unchanged, preserve its Ready Player Me
attribution and CC BY-NC 4.0 terms, and do not present it as a commercially
approved production model. Any additional asset needs its own source, license,
and compatibility review.

## Consequences

- Controller behavior and scene lifecycle remain testable without requiring
  any particular 3D asset.
- Aster remains usable when WebGL setup, rendering, or context recovery fails.
- The GLB validator provides deterministic structural and budget checks but
  does not prove visual quality, animation fidelity, or licensing.
- Avatar authoring remains an MPFB2/Blender workflow; it is not a runtime
  dependency.
- Generating an original MPFB/Blender asset and selecting among multiple
  validated models are tracked follow-up tasks. Commercial asset approval and
  performance measurement remain open. Speech, LLM, mail, memory, and Home
  Assistant remain out of Phase 1.
