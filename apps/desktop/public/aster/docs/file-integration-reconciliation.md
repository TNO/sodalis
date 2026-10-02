# File integration reconciliation and merge audit

This audit reconciles the two overlapping unmerged proposals and the saved local
implementation. Neither source transfer nor an earlier partial browser result is
counted as a completed implementation.

## Inputs inspected

| Input | Exact revision / verification |
| --- | --- |
| Common deployed base, Aster 1.9.4 | `bc4d4f5cb2cb6a798e4e4fc37d368b62ca6ac6d1` |
| PR #15, `feat/web-app-file-integration` | `8ec78b9d490967f31b8e272aef18b1b113610e3d`; full editable source recovered from Actions artifact `10120387131` |
| PR #16, `feat/web-file-portal` | `fe4feb29e4e77c2a5bc02f342f38f46156325513`; staged tree inspected from artifact `10124238552` |
| Local `Aster-File-Portal-Implementation.zip` | 193 source files plus snapshot manifest; every recorded file hash checked; archive SHA-256 `0a211d063def1c3d44b9e13dd19f5ac1e115446dcbc32ea2d508233619b6b4f9` |

The PR #15 artifact SHA-256 is
`aaff43d8656d71afb6060ddf3484225dfd3f0481551ceac55f64151859dc0961`.
The PR #16 diagnostic artifact SHA-256 is
`47405a336bc83511a6f49593d3cfc5b47c20f7aeb0f06758117b435e120b54d7`.
Both were independently checked on download.

PR #16 contained **46,924** encoded characters where its importer expected
**48,892**; the fourth chunk was truncated to 5,032 characters. The XZ payload
fails decompression. Its importer correctly stopped before writing runtime source.
Simply merging that tree would have installed neither its SDK nor its new host.
The complete local archive was therefore inspected instead. No additional
pre-existing editable source workspace or uncommitted Git repository was found in
the available mounted workspace; older baseline archives and failure screenshots
were retained, not mistaken for a newer implementation.

## One implementation, not two overlapping interceptors

The integrated runtime is `src/web-io-models.js`, `src/web-io-client.js`,
`src/web-io-host.js` and `src/web-io-shell.js`. The complete PR #15 feature set is
retained: automatic trusted-origin attachment, opaque bootstrap, scoped handles,
real streams, atomic writes/history, policies, native fallback, file inputs,
downloads, recursive imports and transfer shelf/pointer relay.

The following useful capabilities from the alternative local Portal were ported
into that same runtime rather than discarded:

| Local Portal capability | Consolidated implementation |
| --- | --- |
| Separate read/write policy | Independent `write` policy, Settings control, read-only queries and live revocation |
| Exclusive writers | `createWritable({mode: 'exclusive'})` and collision checks across active sessions |
| Save selection without filesystem side effects | Pending new-file capability; create/replace at stream close only; abort preserves absence |
| Reusable scoped handles | Stable capability reuse, bounded enumeration preflight, no refresh-induced handle leak |
| Published cooperative SDK | Generated `sdk/aster-files.js`, byte-identical to the automatic client; `AsterFileClient.connect` with exact parent-origin allowlist |
| Live-session handle descriptions | `describeHandle` / `restoreHandle`, invalid after revocation or reload |
| Explicit export/drag helpers | `exportFile`, `setDragFiles`, and existing prepared pointer drag/transfer shelf |
| Navigation cleanup | Registered-frame reload/close revokes capabilities, ports and uncommitted streams |
| TwinForge real-app coverage | Unchanged deployed folder connection and New folder operation, alongside the original NotepadXP round trip |

The alternative private-storage route is intentionally resolved to one explicit,
confirmed per-app reserved root. It is not a second directory selector sharing
another app's storage. The chosen bounds and unsupported native-handle behavior
are documented in `web-files.md`; the incompatible alternative settings schema,
protocol, duplicate modules and duplicate API hooks are superseded, not loaded.
The old `docs/web-file-integration.md` links to the unified contract.

## Review findings and regressions

All eight initial PR #15 review findings are addressed in the consolidated source:
opt-in Orbit SDK attachment; transient activation before pickers; reusable child
grants; distinct duplicate native root names; app-storage file collision checks;
root navigation versus grant separation; private-root exclusion; and folder-kind
revalidation after the picker opens.

A failed HTTP drag test also revealed that a prepared export link's trailing
click navigated its iframe into a nested Aster document, revoking the transfer.
The prepared drag now suppresses that click without suppressing ordinary clicks
when no drag started. Queued transfer writes recheck source authority inside the
final Explorer database transaction, not just when import preparation begins.

`tests/web-io/review_checks.py` adds visible/API regressions for these cases,
including a real second HTTP origin using the published SDK and unchanged opaque
sandbox. Browser reports separate injected memory, HTTP, standalone and Firefox
runs. The live test never replaces NotepadXP or TwinForge application responses.

## Merge procedure

PR #16 is stacked on the PR #15 implementation branch as the reconciliation and
verification changes. Both histories are retained. The source-transfer chunks and
one-off importer/recovery workflows are removed from the final tree. There is one
reusable file-I/O verification workflow, with SDK reproducibility checked.

After hosted verification passes on the consolidated head, merge #16 into #15's
branch, verify that exact resulting head, and merge #15 into main. Check the Pages
build and deployed commit separately. This document records the procedure and
source disposition; successful test/merge claims belong to actual Actions and PR
results, not an assumed status in this file.
