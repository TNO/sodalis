# 0092 Spec: Home Simulator through its MCP workflow

Status: done
Type: spec
Triage: ready-for-agent
Priority: medium
Subsystem: server, scripts, compose

Source: the grilling session that produced the **Simulated home**,
**Home Assistant simulator**, **Home Simulator** and **Replay session** entries
in [`GLOSSARY.md`](../GLOSSARY.md). Terms are used as written there. The
Home Simulator is a separately owned project (`home_simulator`); Sodalis uses
it as provided and requests any change from its owners.

## Problem Statement

A Sodalis developer who runs the **simulated home** gets a Home Assistant
simulator they can command, but no believable sensor history, household context,
weather or agenda for the companion to talk about. The only simulated data path
the harness has today depends on a Neo4j graph that does not exist in the
development setup, plus a bind-mounted SQLite file. The Home Simulator already
produces exactly this data and exposes it through an MCP workflow, but Sodalis
cannot reach it: the MCP server speaks only stdio and must be started as a child
process with its own Python environment, while the `ai` server runs in a
container.

## Solution

When the existing simulator flag is on, the stack launcher also starts a small
Sodalis-owned **host bridge** that exposes the Home Simulator's session-bound
avatar reader to the containerised `ai` server. A session script, run by the
launcher, picks or generates a dataset and opens a fresh **replay session**.
The companion then gets five read-only Home Simulator tools (sensor data,
context, ontology, weather, agenda) and is told the simulated "now" (the replay
session's clock). The developer moves the replay forward with a separate
operator script; the assistant cannot. No compose service is added, nothing of
the Home Simulator is copied or published, and the Neo4j and SQLite paths are
left untouched but unused while the flag is on.

## User Stories

Developer running the stack:

1. As a developer, I want the existing simulator flag to also bring up the Home Simulator data, so that I do not learn a second switch for the same simulated home.
2. As a developer, I want to point `HOME_SIMULATOR_ROOT` at my `home_simulator` checkout, so that Sodalis uses the code and Python environment I already have.
3. As a developer, I want Sodalis to use the checkout's own Python interpreter, so that I do not install or build anything extra.
4. As a developer, I want `stack:up` to stop with a clear error when `HOME_SIMULATOR_ROOT` is missing or invalid while the flag is on, so that I find the mistake before anything starts.
5. As a developer, I want the error to say what to set and where, so that I can fix it without reading the code.
6. As a developer, I want nothing Home Simulator related to start when the flag is off, so that stacks that do not need it stay unchanged.
7. As a developer, I want no new service in the compose stack, so that there is no third-party code to build, publish or keep in sync.
8. As a developer, I want the launcher to start the host bridge for me when the flag is on, so that I do not run extra processes by hand.
9. As a developer, I want the launcher to stop the host bridge on `stack:down`, so that nothing is left running on my machine.
10. As a developer, I want the host bridge to listen only on a private interface, so that the simulated home is not reachable from the network.
11. As a developer, I want the containerised `ai` server to reach the bridge through the usual host address, so that it works the same way as the other host-side helpers.
12. As a developer, I want the session script to reuse an existing generated dataset for the scenario, so that launching is quick.
13. As a developer, I want the session script to generate a dataset once when none exists, so that a first launch works without manual steps.
14. As a developer, I want the scenario to default to `avatar-support`, so that a first run needs no configuration.
15. As a developer, I want to override the scenario through an environment setting, so that I can try other homes and timelines.
16. As a developer, I want a fresh replay session on every `stack:up`, so that each run starts from the beginning of the dataset.
17. As a developer, I want the session script to hand the session ID and state directory to the bridge, so that the reader is bound to exactly that replay session.
18. As a developer, I want an operator script that advances the replay to the next interaction, so that I can stage "what the home looks like now" before I talk to the companion.
19. As a developer, I want the advance script to read every page of the batch before acknowledging, so that the replay's cursors stay consistent.
20. As a developer, I want the advance script to say when the dataset has ended, so that I know there is nothing left to replay.
21. As a developer, I want the advance script to be safe to run repeatedly, so that a retry after a failure does not skip observations.
22. As a developer, I want the assistant never to advance the replay, so that the scene only changes when I decide.
23. As a developer, I want the Neo4j settings to stay valid but be ignored while the flag is on, so that I can switch between setups without editing them.
24. As a developer, I want the SQLite reading path unused while the flag is on, so that there is one source of simulated readings.
25. As a developer, I want the Neo4j and SQLite code left in place, so that the real graph can come back later without a rewrite.

Using the companion:

26. As a developer talking to the companion, I want it to answer questions about recent sensor readings from the replay session, so that I can see the simulated home in the conversation.
27. As a developer, I want the companion to read household and home context, so that it can refer to rooms, devices and people consistently.
28. As a developer, I want the companion to query the ontology with read-only queries, so that it can look up what a device or room is.
29. As a developer, I want the companion to read weather for the simulated day, so that it can talk about conditions at the replay's time.
30. As a developer, I want the companion to read the agenda for the simulated day, so that it can mention appointments and reminders.
31. As a developer, I want the companion told the simulated "now" (the replay session's clock), so that "latest reading" and "stale" mean the dataset's time and not today's date.
32. As a developer, I want queries never to reveal observations later than the replay clock, so that the companion cannot see the future of the replay.
33. As a developer, I want results to stay within sensible size and time limits, so that a single question cannot flood the model.
34. As a developer, I want the companion to say plainly when the Home Simulator is unavailable, so that a stopped bridge is not mistaken for an empty house.
35. As a developer, I want the companion not to offer the graph tools while the flag is on, so that it never claims a graph exists.
36. As a developer, I want the companion unable to call batch reading, acknowledgement, claim parsing or session tools, so that only the five read-only capabilities are reachable from the model.
37. As a developer, I want the companion unable to author scenarios, generate datasets or open sessions, so that the coordinator role is never reachable from the assistant.
38. As a developer, I want the companion unable to change the replay or the simulated physical state, so that conversation has no side effect on the dataset.
39. As a developer, I want the companion's existing refusal to execute Home actions without confirmation to be unchanged, so that adding the Home Simulator widens nothing.

Maintainers and reviewers:

40. As a maintainer, I want the Home Simulator vocabulary used consistently, so that "simulator" never leaves it unclear whether the Home Assistant simulator or the Home Simulator is meant.
41. As a maintainer, I want no Home Simulator code copied, vendored or published in this repository, so that ownership stays with its authors.
42. As a maintainer, I want the avatar role to be the only role Sodalis ever starts, so that the permission boundary of the Home Simulator is preserved.
43. As a maintainer, I want an ADR recording the host bridge, the avatar-role-only boundary and the absence of a compose service, so that a future reader knows why.
44. As a maintainer, I want CI to test the feature against a fake Home Simulator endpoint, so that it stays green without a checkout.
45. As a maintainer, I want a live test against a real checkout that skips itself without `HOME_SIMULATOR_ROOT` and never runs in CI, so that CI needs no Python environment or secrets.
46. As a maintainer, I want the stack documentation to describe the flag, `HOME_SIMULATOR_ROOT`, the session script and the advance script, so that a new developer can run it from the docs.
47. As a maintainer, I want the documentation to state that the Home Simulator replay is read-only and cannot be changed by dialogue, so that nobody expects conversation to move the house.

## Implementation Decisions

- **Flag and scope.** The existing simulator flag turns on the Home Simulator part of the simulated home. When it is off nothing changes. The Home Assistant simulator is unaffected.
- **Checkout.** A `HOME_SIMULATOR_ROOT` setting holds the absolute path of the `home_simulator` checkout. Sodalis runs the checkout's own Python environment and keeps the MCP state directory inside it. Nothing is copied or vendored.
- **Failure.** Stack selection fails fast, with an actionable message, when the flag is on and `HOME_SIMULATOR_ROOT` is missing or not a usable checkout. A bridge that disappears later is not a startup failure: the tools report that the Home Simulator is unavailable and the server logs a warning. This replaces an earlier "warning only" preference.
- **No compose service.** The `ai` container gains only environment settings (bridge address and, when needed, the scenario). The launcher starts and stops the host-side processes, the same pattern the stack uses for other host helpers.
- **Host bridge.** A Sodalis-owned process runs the Home Simulator's avatar reader as a stdio child bound to one replay session and exposes it to the `ai` container over HTTP on a private host interface. The port is unauthenticated, by decision, for this development-only setup; reachability is limited by binding to a private interface, as for the other host helpers.
- **Session script.** A TypeScript script, run by the launcher only when the flag is on, drives the coordinator over stdio on the host. It reuses a generated dataset for the scenario (default `avatar-support`, overridable by environment), generates one once when none exists, and opens a fresh replay session on each launch. It hands the session ID and state directory to the bridge. It never exposes the coordinator.
- **Advance script.** A separate TypeScript script, run by the operator, advances the replay to the next interaction: it reads all pages of a batch, then acknowledges. Acknowledgement is a context checkpoint only; Sodalis stores nothing durably in this effort. The assistant has no way to call it.
- **Assistant tools.** Five curated, read-only tools: sensor data query, context, ontology query, weather and agenda. They are separate from the existing graph tools. The Sodalis server maps them onto the avatar reader and calls nothing else; the batch, acknowledgement, claim parsing and session tools are used only by scripts or internally.
- **Simulated now.** The `ai` server reads the replay session's clock internally and states it to the model as the simulated "now"; freshness judgements use it. Wall-clock time is not used for Home Simulator results.
- **Neo4j and SQLite.** Left untouched and deferred. While the flag is on, the graph tools and the SQLite reading tool are not offered and Neo4j settings are ignored. Existing behaviour with the flag off is preserved.
- **Sensitive data.** No additional exclusion filter is added for Home Simulator results, by decision, because the data is synthetic and gated by the flag. Existing exclusions for the graph path are unchanged.
- **Harness requirement.** The Home Simulator tools exist only when the companion harness is enabled, as for the existing Home tools.
- **Python.** The checkout's environment is a given (currently Python 3.14); Sodalis neither pins nor installs it.
- **ADR.** [ADR 0009](../docs/adr/0009-home-simulator-host-bridge.md) (accepted) records the host bridge, the avatar-role-only boundary and the absence of a compose service; [ADR 0007](../docs/adr/0007-companion-harness.md) still governs the harness boundary.
- **Glossary.** **Simulated home**, **Home Assistant simulator**, **Home Simulator** and **Replay session** are already defined and must be used.

## Testing Decisions

A good test exercises external behaviour at a public interface: what the model
is offered and receives, what the launcher accepts or rejects, and what the
scripts do to a replay session. It does not assert on the bridge's internal
structure, process plumbing or the Home Simulator's internals.

Three seams, agreed during the session:

1. **Assistant tool surface (existing seam, primary).** Behaviour tests against a fake bridge endpoint, in the style of the existing harness tool tests: each of the five tools returns a bounded, correctly shaped result; the simulated now is stated; the unavailable state is reported plainly; no other Home Simulator capability is reachable; the graph and SQLite tools are not offered while the flag is on, and are unchanged when it is off.
2. **Stack selection (existing seam).** Behaviour tests in the style of the existing stack-selection and compose-configuration tests: the flag enables the Home Simulator path; a missing or invalid `HOME_SIMULATOR_ROOT` fails fast with a clear message; the environment reaches `ai`; no new compose service appears; the flag off changes nothing.
3. **Host scripts (new seam).** Behaviour tests driving the bridge, session and advance scripts against a fake stdio MCP server fixture: dataset reuse versus generate-once, a fresh session per launch, the bridge serving only the avatar reader, the advance script reading all pages before acknowledging and being safe to repeat, and the coordinator being unreachable from the bridge.

A live test against a real checkout skips itself without `HOME_SIMULATOR_ROOT`
and never runs in CI. No cloud credentials are involved. Per the repository's
test tiers, the avatar-role-only boundary and the public server tool surface
need these behaviour tests; evaluation scripts need none.

## Out of Scope

- Neo4j, the existing graph tools and the SQLite reading path (deferred, left untouched).
- Linking Home Simulator data to the Home Assistant simulator's entities.
- Feeding replayed observations into long-term memory.
- Using replayed interactions to trigger avatar-initiated prompts.
- Any compose service for, or copy, vendoring or publication of, the Home Simulator.
- Assistant access to the coordinator, scenario authoring, dataset generation or session creation.
- Changes to the `home_simulator` repository; any needed change is requested from its owners.
- Authentication on the host bridge and an extra sensitive-data filter.
- Recovery when the bridge dies mid-run beyond reporting unavailable.

## Further Notes

- The launcher failing fast means every simulator stack with the flag on needs a checkout. Developers who want only the Home Assistant simulator would be blocked; this follows from the decision to reuse the existing flag and is worth revisiting if it bites.
- The replay is immutable: dialogue cannot change the simulated physical state, so the companion should not imply that it can.
- Drafted from the grilling session; no implementation exists yet. Suggested slicing: stack selection and flag handling; host bridge and session script; advance script; assistant tools with simulated now; documentation and accepting ADR 0009.
