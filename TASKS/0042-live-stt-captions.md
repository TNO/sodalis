# 0042 Improving live STT captions

Status: open
Priority: medium
Subsystem: speech
Depends on: 0035

## Context

The STT evaluation in
[docs/evaluations/stt-providers.md](../docs/evaluations/stt-providers.md)
found that Parakeet TDT snapshot re-transcription supports live captions on
CPU, with about 0.5 s of caption lag. However:

- `finish` waits for any interim transcription still running, which adds
  about 0.2–0.5 s to the final transcript.
- About a quarter to a third of caption updates rewrite earlier words.
- Re-transcription cost grows with the utterance length.

In an isolated experiment, NVIDIA Nemotron 3.5 streaming (sherpa-onnx)
showed about 0.2 s of lag and never rewrote earlier words, but it was less
accurate (13.6% vs 8.6% WER on six private clips). It also mis-transcribed
one Dutch phrase as German.

## Acceptance Criteria

- When speech ends, cancel or skip a stale in-flight interim transcription,
  so the final transcript is not delayed by it. Cover this at the speech API
  and browser STT client interfaces.
- Measure caption lag, final latency, and rewrites on longer (more than
  15 s), noisy, and continuous-microphone Dutch utterances, using the
  existing Parakeet snapshot path.
- Decide whether a true-streaming engine (for example Nemotron) is needed.
  If it is:
  - review its license;
  - add an incremental-audio path behind the Sodalis speech API and an
    opt-in Compose profile;
  - keep the browser contract and explicit provider selection.
- Record the results in `docs/evaluations/stt-providers.md`.

## Implementation Notes

- The isolated benchmark harness (sherpa-onnx server with offline and
  streaming modes, plus a live-caption replay script) was kept local and
  uncommitted during task 0035. Commit or re-create it, without private
  audio, if it is needed for this task.
- Correct the private reference typos and agree on number normalisation
  before comparing WER differences of a few points.

## Agent Notes
