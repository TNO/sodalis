# 0097 Document the Home Simulator path, add the live test, accept ADR 0009

Status: open
Triage: ready-for-agent
Priority: medium
Subsystem: docs, scripts
Spec: [0092](0092-home-simulator-mcp-spec.md)
Depends on: 0093, 0094, 0095, 0096

## Acceptance Criteria

- `docs/development-stack.md` (and `.env.example` comments, `apps/server/README.md`
  and `docs/architecture/companion-harness.md` where they describe the home
  data path) describe: that the existing flag also brings up the Home Simulator,
  `HOME_SIMULATOR_ROOT` and the other settings, the fail-fast error, the session
  script and a fresh replay session per `stack:up`, the advance script, the
  bridge's private-interface binding and the Linux `host-gateway` caveat, that
  Neo4j/SQLite are ignored while the flag is on, and that the replay is
  read-only and cannot be changed by dialogue. Use the glossary terms
  (**Simulated home**, **Home Assistant simulator**, **Home Simulator**,
  **Replay session**); never "simulator" alone where it is ambiguous.
- Live test against a real checkout (`describe.skipIf(!process.env.HOME_SIMULATOR_ROOT)`):
  generate-or-reuse a dataset, open a session, start the bridge, read the five
  tools and the clock, advance once. Never runs in CI (verify it is skipped in
  the CI test run) and needs no cloud credentials.
- ADR 0009 marked Accepted (date updated); `TASKS/0092` and tickets 0093–0097
  set to `Status: done`, boxes checked in `TASKS/README.md`.
- Final check of the whole feature with the real checkout at
  `/home/al/github-projects/home_simulator` when it exists (no cloud providers
  are involved; do not run `stack:smoke`, live LLM or cloud checks).
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm build`.
