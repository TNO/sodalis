# WAYFIND

Local-markdown tracker for Wayfinder efforts. Kept apart from `TASKS/`: a map
holds **decision tickets** (questions whose answer is a decision), not
implementation work.

## Layout

```
WAYFIND/<effort>/map.md          the map (label: wayfinder:map)
WAYFIND/<effort>/Tnn-<slug>.md   one decision ticket, a child of the map
```

## Ticket file

Front matter, then the body:

```markdown
---
title: <name of the ticket; refer to it by this>
label: wayfinder:research | wayfinder:prototype | wayfinder:grilling | wayfinder:task
status: open | closed
assignee: <dev who claimed it; empty means unclaimed>
blocked-by: [Tnn-<slug>.md, ...]
---

## Question

<the decision or investigation>

## Resolution
<added on closing: the answer, links to assets>
```

## Operations

- **Frontier**: tickets with `status: open`, empty `assignee`, and every
  `blocked-by` ticket `closed`.
- **Claim**: set `assignee` before any work.
- **Resolve**: write `## Resolution`, set `status: closed`, add a one-line
  gist and link under the map's *Decisions so far*.
- **Out of scope**: close the ticket and add a line to the map's *Out of
  scope*; keep it out of *Decisions so far*.
- Research findings live on a throwaway `research/<name>` branch that is
  never merged; the ticket's resolution points to it.
- Assets created while resolving a ticket are linked, not pasted.
