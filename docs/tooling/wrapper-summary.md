# Wrapper summary

This document owns wrapper scope, freshness, locks, handoffs, and observability. Public commands belong in [operator-handbook.md](operator-handbook.md). Quality policy belongs in [code-quality.md](code-quality.md).

`AGENTS.md` owns implementation, QA, review, and closeout order, including conditional workflow requirements. This document describes each wrapper's behavior within that workflow.

## Local wrappers

- `qa:preflight` reads the current diff or explicit files. It writes an observability record. It does not format, lock, build, or write proof state. In the Codex desktop sandbox, run it with escalated command permissions on the first attempt. Its Git subprocesses can fail with `spawnSync git EPERM` under default sandbox permissions.
- Advisory diagnosis is an embedded, non-blocking stage of `qa:preflight`, `qa:checkpoint`, and checkpoint reuse in `qa:closeout`. It has no standalone workflow command.
- `qa:structural-audit` writes a manual non-blocking repository topology report.
- `qa:release-harness` formats supported changed files. It checks QA composition and applicable dependencies. It runs selected harness proof. It writes a content-bound freshness stamp.
- `qa:checkpoint` formats supported changed files and recollects the diff. It requires applicable harness freshness. It records advisory results and runs selected focused controls and tests.

  Its change-risk report detects a bounded set of classified seams and routes human review. That report does not determine that unmatched changes are low risk or waive executor review assessment. It does not affect status or create review state. The wrapper does not build, stage, or commit.
- `qa:closeout` reuses a matching checkpoint or runs one. It hands its lock to the internal build. It checks the unchanged diff and stages allowed files. It rejects `tasks/**`. It commits after successful build proof.

`qa:internal:build` is an internal closeout script. Its observed identity is `qa:build`. It owns artifact construction and commit automation, not checkpoint semantics. `ci:build` is a build-only bypass without QA or provenance evidence.

The control catalog owns wrapper membership and order. The scope classifier owns harness and inventory classification. Do not copy either mapping into documentation.

## Freshness and reuse

Harness state binds harness/shared-control content. Checkpoint state binds the current diff. A change to bound content invalidates the state.

Unit, coverage, build, archive, CodeQL, and release proof are separate receipts. A consumer may reuse a receipt only if all these values match:

- Machine-registered inputs.
- Candidate tree.
- Control digest.
- Environment identity.
- Suite.
- Output hashes.

Missing, malformed, partial, or incompatible proof triggers execution or fails admission according to its owner.

Resource settings are execution metadata from the run record. They do not change semantic scope. Cross-control-digest reuse is forbidden.

`ci:proof` owns full product tests and coverage. It creates Fast proof without archive evidence. `ci:release` requires exact admitted Fast proof. It runs only release-owned controls and archive construction.

## Locks and scheduling

`qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `ci:proof`, and `ci:release` share the blocking lifecycle. Closeout alone may hand its lock to the internal build.

On Linux, including WSL, these wrappers share one FIFO queue across directories under the same user. An active wrapper holds the slot. Other wrappers wait before formatting or checks. The kernel lock suspends the waiting process. The wrapper prints one waiting message and records a separate `host-admission` timeline activity. It reads the candidate after admission.

The queue uses private records in `/tmp/sniptale-qa-<uid>`. Cancellation removes the waiting ticket. Recovery checks the Linux boot identity and process start time. Before admission, recovery stops abandoned QA descendants that inherit the ticket marker. Cleanup requires a readable process environment. It never signals a process without the matching marker.

The repository lock still rejects a second active wrapper in the same directory. Other platforms retain this repository lock. Preflight and help do not enter the host queue. An authenticated closeout/build handoff retains the existing host slot.

Local CI holds both slots through setup, canonical checks, and artifact sealing. It executes the canonical operation in the same process. Standalone CI wrappers also normalize dependencies and admit inherited evidence after host admission. Observability refreshes candidate identity after admission, including a derived workflow ID when HEAD changes.

Checkpoint completes formatting before parallel focused lanes start. Fast proof schedules repository controls, product proof, harness proof, audits, and build through the machine catalog. Release does not rerun product or harness tests.

Pre-push runs `qa:release-harness` and then `qa:checkpoint` in the same pushed-range workspace.

## Observability and failure

Wrappers write atomic structured run records and bounded sanitized logs under `.tmp`. Records include scope, controls, states, timing, waits, resources, reuse, skips, and failures. Preflight context, checkpoint change risk, and advisory introduced/worsened/existing buckets are structured record fields, not log-only prose.

Correlation uses the task ID plus an explicit workflow ID or a deterministic candidate workflow. It derives that candidate workflow from the task and base Git HEAD. It does not record review completion. Full gates also collect allowlisted reports, receipts, manifests, checksums, and release artifacts under `build/ci-artifacts`.

A failed full gate still seals available diagnostic evidence. Timeout handling writes best-effort incremental evidence before external cleanup.

Use the operator handbook's [focused diagnostics](operator-handbook.md#focused-diagnostics) after a wrapper failure.
