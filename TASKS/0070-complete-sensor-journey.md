# 0070 Complete a sensor journey end to end

Status: open
Priority: high
Subsystem: assistant
Depends on: 0069

## Context

The first household/resident journey has been manually verified, but a
sensor-reading journey has not. This is the first accepted end-to-end data
journey after diagnosing the retrieval gap; preserve the existing graph
household/resident behavior rather than rewriting the knowledge graph.

Task 0069's sanitized audit evidence shows an observed workflow terminating
after `find_entities` and `inspect_neighborhood`, without selecting or
dispatching `read_external_data`. It does not uniquely identify the historical
manual sensor question or establish source availability. Use this task to
exercise the full read path with deterministic local data; do not treat an
absent live-source check as a successful reading.

## Acceptance Criteria

- Complete a representative question by resolving the intended graph entity,
  discovering its supported external-data reference, obtaining an actual
  reading from that source, and giving a grounded answer.
- State the reading's source, timestamp, and freshness truthfully. A known
  historical snapshot may support a stale reading, but must never be presented
  as fresh or current.
- Cover relevant wrong-entity, unavailable, empty, stale, and conflicting
  evidence cases with honest outcomes; do not invent sensor mappings or
  readings.
- Make the journey repeatable with deterministic local fixtures. Report local
  fixture results separately from any real-source result. Every live external
  check requires separate explicit user consent for that run; absent consent
  or access remains an explicit blocker, not a successful live check. Cloud
  provider commands also follow the repository's provider-selection checks.
- Update the architecture and task evidence without changing unrelated graph
  household/resident behavior.

## Implementation Notes

Keep acceptance grounded in what the configured source actually returns. No
latency threshold is selected by this task.
