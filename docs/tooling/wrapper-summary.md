# Wrapper summary

This document owns wrapper scope, freshness, locks, handoffs, and observability. Public commands belong in [operator-handbook.md](operator-handbook.md). Quality policy belongs in [code-quality.md](code-quality.md).

[AGENTS.md](../../AGENTS.md) owns implementation, QA, review, and closeout order, including conditional workflow requirements. This document describes the behavior of each wrapper within that workflow.

## Local wrappers

- `qa:preflight` reads the current diff or explicit files. It writes an observability record but does not format, lock, build, or write proof state.
- `qa:advisory` runs optional non-blocking diagnosis over the current diff.
- `qa:structural-audit` writes a manual non-blocking repository topology report.
- `qa:release-harness` formats supported changed files, validates QA composition and applicable dependencies, runs selected harness proof, and writes a content-bound freshness stamp.
- `qa:checkpoint` formats supported changed files, recollects the diff, requires applicable harness freshness, records advisory results, and runs selected focused controls and tests. Its change-risk report detects a bounded set of classified seams and routes human review but does not determine that unmatched changes are low risk, waive executor review assessment, affect status, or create review state. It does not build, stage, or commit.
- `qa:closeout` reuses a matching checkpoint or runs one, hands its lock to the internal build, verifies the unchanged diff, stages allowed files, rejects `tasks/**`, and commits after successful build proof.

`qa:internal:build` is an internal closeout script. Its observed identity is `qa:build`. It owns artifact construction and commit automation, not checkpoint semantics. `ci:build` is a build-only bypass without QA or provenance evidence.

The control catalog owns wrapper membership and order. The scope classifier owns harness and inventory classification. Do not copy either mapping into documentation.

## Freshness and reuse

Harness state binds harness/shared-control content. Checkpoint state binds the current diff. A change to bound content invalidates the state.

Unit, coverage, build, archive, CodeQL, and release proof are separate receipts. A consumer may reuse a receipt only when its machine-registered inputs, candidate tree, control digest, environment identity, suite, and output hashes match. Missing, malformed, partial, or incompatible proof triggers execution or fails admission according to its owner.

Resource settings are recorded execution metadata. They do not alter semantic scope. Cross-control-digest reuse is forbidden.

`ci:proof` owns full product tests and coverage. It creates Fast proof without archive evidence. `ci:release` requires exact admitted Fast proof and runs only release-owned controls and archive construction.

## Locks and scheduling

`qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `ci:proof`, and `ci:release` share the blocking lifecycle and must not run concurrently. Closeout alone may hand its lock to the internal build.

Checkpoint completes formatting before parallel focused lanes start. Fast proof schedules repository controls, product proof, harness proof, audits, and build through the machine catalog. Release does not rerun product or harness tests.

Pre-push runs `qa:checkpoint`.

## Observability and failure

Wrappers write atomic structured run records and bounded sanitized logs under `.tmp`. Records include scope, controls, states, timing, waits, resources, reuse, skips, and failures. Full gates also collect allowlisted reports, receipts, manifests, checksums, and release artifacts under `build/ci-artifacts`.

A failed full gate still seals available diagnostic evidence. Timeout handling writes best-effort incremental evidence before external cleanup.

Use the operator handbook's [focused diagnostics](operator-handbook.md#focused-diagnostics) after a wrapper failure.
