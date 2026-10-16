# 0052 Ingesting observations into memory

Status: open
Priority: low
Subsystem: assistant
Depends on: 0047, 0038

## Context

Task 0039 distinguishes observations, such as app actions and Home Assistant
events, from user statements. Version 1 ingests chat only
([ADR 0005](../docs/adr/0005-long-term-memory.md)).

## Acceptance Criteria

- Ingest selected app-action and Home Assistant events as observation records
  with their source. Mark derived items as `observed`.
- Never draw health conclusions from observations on their own.
- Add tests for source preservation and for separating observations from
  statements.

## Agent Notes
