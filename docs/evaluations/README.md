# Evaluations

This folder holds the **final, consolidated analysis** of every Sodalis
evaluation, such as the alternate STT, TTS, and LLM provider tasks
(`TASKS/0035`–`0037`). Write one document per evaluation here, so readers have
a single place to find conclusions.

## Conventions

- Name the file after the subject, for example `tts-providers.md`, and add
  it to the index below.
- Each document states its status and date, and has these sections:
  - summary and recommendation
  - scope
  - method and hardware
  - results
  - analysis
  - limitations
  - open items
- Keep setup and reproduction commands in
  [`../development-stack.md`](../development-stack.md) and link to them;
  do not duplicate them here.
- Keep per-session progress in the task's Agent Notes. Put conclusions here
  and link this document from the task.
- Generated audio, model weights, and raw metrics stay in the ignored
  `models/` folder; record only the measured results.

## Index

| Evaluation | Task | Status |
| --- | --- | --- |
| [Dutch TTS providers](tts-providers.md) | 0036 | Automatic gates complete; listening review pending |
| Alternate STT providers | 0035 | Not yet consolidated; interim results in [development-stack.md](../development-stack.md#try-local-whistle-or-parakeet-tdt-in-compose) |
| Alternate LLM providers | 0037 | Not started |
