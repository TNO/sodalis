# 0054 Adding CI and published images

Status: in progress
Priority: high
Subsystem: devops
Depends on: 0034

## Context

Sodalis had no CI or CD. The quality gates ran only locally, the root test
script missed a test file, and `scripts/` was never type-checked. Every
developer built all Compose images locally, which on a MacBook means compiling
FFmpeg and downloading the Parakeet weights. The design is in
[ADR 0006](../docs/adr/0006-ci-cd.md), and the test-tier and quality-tooling
analysis is in
[evaluations/ci-quality-and-tests.md](../docs/evaluations/ci-quality-and-tests.md).

## Acceptance Criteria

- Run typecheck, tests, and build on Ubuntu and macOS for every pull request,
  with FFmpeg on Linux so the FFmpeg-dependent tests run.
- Run the Python tests, Compose config validation, image build checks,
  actionlint, and dependency review. Summarize all jobs in one `ci-ok` check.
- Discover root script tests automatically; type-check `scripts/`; add
  `pnpm test:python`.
- Enable `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, and
  `noFallthroughCasesInSwitch`, and fix the findings.
- Publish `api`, `gateway`, and `parakeet-tdt` to GHCR for amd64 and arm64 on
  `main` and `v*` tags, only after CI passes, with provenance attestations and
  OCI licence and attribution metadata.
- Pull Parakeet TDT in Compose by default, keep an opt-in local build, and let
  the local API and gateway builds reuse the registry cache.
- Add CodeQL and Dependabot, and document the test-tier policy in `AGENTS.md`.
- Never send data to cloud providers from CI, and configure no provider
  secrets.

## Implementation Notes

- `ci.yml` is also a reusable workflow; `publish-images.yml` calls it before
  building, so `main` runs CI once.
- Registry build caches are per architecture (`:buildcache-amd64`,
  `:buildcache-arm64`), so the two native builds don't overwrite each other.
- `compose.local-images.yaml` is only added when `SODALIS_LOCAL_IMAGES=true`.
  `stack:up --build` would otherwise always rebuild a service that has a
  `build:` section.

## Remaining manual steps (repository admin)

- After the first publish, make the three `sodalis-*` GHCR packages public:
  Organization > Packages > Package settings > Change visibility. Without this,
  developers cannot pull them anonymously.
- Protect `main` (Settings > Branches or Rulesets):
  - require a pull request;
  - require the status check `ci-ok`;
  - require branches to be up to date;
  - block force pushes.
- Optional: require the `CodeQL` checks as well.

## Agent Notes

- 2026-10-19 Copilot: Implemented the workflows, test-gate fixes, stricter
  `tsc`, Compose pull, and documentation. Verified locally:
  - `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:python` pass.
  - With FFmpeg, the Python suites pass in `python:3.12-slim`.
  - The server suite passes inside the API image: 95 tests run, 1 live test
    skipped.
  - The gateway and API images build with the `pnpm fetch` layering.
  - Both Compose modes render.
  - actionlint passes.
  
  The first hosted run, the first GHCR publish, and the arm64 Parakeet build
  remain to be verified.
