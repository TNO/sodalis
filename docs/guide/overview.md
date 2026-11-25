# What is Sodalis?

Sodalis explores a local-first personal desktop with an embodied conversational
assistant. It is intended to help people use digital applications through
both a graphical interface and conversation, with particular attention to
older adults and accessibility.

## What exists today

- A browser desktop based on Aster, with a Sodalis-owned assistant interface.
- Text and speech interaction, with selectable speech and language-model
  providers and a choice of avatar or animated dots.
- A read-only companion workflow that can query generated household context
  and sensor data from a Home Simulator replay.
- A separate Home API and Home Assistant Core simulator for testing typed
  device operations. This is not a real-home integration.
- Optional long-term memory in the regular turn path, governed by consent;
  the replay workflow does not use it.

The simulator replay, Home Assistant simulator, and assistant execution modes
are separate concepts. See the [architecture](../architecture/system.md)
for their boundaries and [setup](./setup.md) for how the current stack starts
them.

## Limits

This is a research prototype, not a production service. Model answers can be
wrong; the replay contains generated data, not live readings. Real Home
Assistant and real personal-account access are not implemented. The replay
workflow cannot control devices or advance the replay through conversation.
The [user guide](./using-sodalis.md) describes the supported experience.

Local providers are available, but cloud providers are explicit options and
send data to their configured services. See the
[provider reference](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#choose-providers)
before enabling them.

## Rationale and directions to explore

The [key decisions and evidence](../architecture/decisions.md) summarize why
the project chose its current boundaries and which alternatives were
considered. The [future-work index](./future-work.md) collects remaining
engineering and research opportunities without presenting them as finished
features.
