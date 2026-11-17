---
title: Sensor signals that hint the user wants to talk
label: wayfinder:research
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

Which smart-home signals could indicate that a person is about to talk to
Sodalis or is receptive to being addressed: presence or motion in the room,
distance to the tablet, doorbell or door events, time of day and routines,
device events such as a kettle or TV, or last-interaction recency? Review
prior art on context-aware or proactive assistants, including what is known
about accuracy and annoyance, and list which signals the repo's Home Assistant
adapter, simulator, and harness sensor journey already expose
(`TASKS/0032`, `TASKS/0038`, `TASKS/0070`). Surface facts only; the decision
comes later.

## Resolution

Findings: branch `research/sensor-intent`, file `research/sensor-intent.md` (never merged).

- The repo exposes no live presence, motion, door, or doorbell signal today. The Home API lists nine domains only (`apps/server/src/home/app.ts`), filters out `binary_sensor`, `person`, and `event`, drops `last_changed`, and has no push channel. TV state is readable on demand through `media_player`. The real Home Assistant adapter (task 0038) is still open.
- The harness sensor snapshot (task 0070) has `Presence` and `DoorOpen` series, but it is a historical snapshot read on demand, with only Temperature exercised end to end.
- No stored last-interaction time, routine logic, or distance sensing exists. Home Assistant has no distance-to-tablet primitive; it does offer presence, occupancy, door, doorbell `event`, and `person` entities, with `subscribe_events` for push.
- Prior art: sensor-based interruptibility prediction reaches about 70-80% accuracy in office and phone studies; last-online cues are weak; Google's Look and Talk relies on a camera, which is out of scope here. No study covers sensor-triggered activation for older adults. Annoyance evidence is qualitative only.
