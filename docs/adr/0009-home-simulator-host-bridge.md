# ADR 0009: Reach the Home Simulator through a host bridge, avatar role only

- **Status:** Proposed
- **Date:** 2026-11-19

## Context

The Home Simulator is a separately owned project that replays a generated
dataset (sensor readings, context, weather, agenda) through an MCP workflow. Its
server speaks only stdio, so a client must start it as a child process with the
checkout's own Python environment (about 570 MB, currently Python 3.14) and a
shared state directory. Sodalis's `ai` server runs in a container and cannot
start host processes. The Neo4j path that the harness used for simulated data
does not exist in the development setup and is deferred. This ADR covers the
development-only simulated home; [ADR 0007](0007-companion-harness.md) still
governs the harness boundary.

## Decision

When the existing simulator flag is on, the stack launcher starts a small
Sodalis-owned **host bridge** on the host. It runs the Home Simulator's
session-bound avatar reader from the checkout named by `HOME_SIMULATOR_ROOT` and
exposes it to the `ai` container over HTTP on a private host interface, as other
host helpers already are. A launcher-run session script drives the coordinator
on the host to open a fresh replay session; an operator-run script advances it.

Sodalis starts only the avatar role. The coordinator (scenario authoring,
dataset generation, session creation) is never reachable from the assistant, and
the assistant gets five curated read-only tools. No compose service is added,
and no Home Simulator code is copied, vendored or published. Changes we need are
requested from its owners.

## Considered Options

- **Compose service mounting the checkout.** Rejected: its pip install would run
  inside a container on every fresh start or be baked into an image built from a
  file in a repository we do not own, coupling our build to theirs.
- **Python and the checkout inside the `ai` image.** Rejected: heavy, and
  bundles third-party code into our image.
- **Native `ai` only, spawning the stdio child.** Rejected: breaks the
  single-compose-stack workflow.
- **Exposing the Docker socket so `ai` can exec the reader.** Rejected on
  security grounds.

## Consequences

- Developers need a working `home_simulator` checkout and `.venv`. The launcher
  fails fast, with a clear message, when the flag is on and `HOME_SIMULATOR_ROOT`
  is missing or invalid, so a Home Assistant simulator alone is no longer
  possible with the flag on.
- The bridge port is unauthenticated, by decision, because it is development
  only; its only protection is binding to a private interface.
- The replay is immutable and dialogue cannot change the simulated state.
- Neo4j and the SQLite reading path are left in place but unused while the flag
  is on.
