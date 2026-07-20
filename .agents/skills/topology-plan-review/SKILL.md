---
name: topology-plan-review
description: Use for analysis-only Sniptale topology planning and review of large root/owner moves, folder-shape normalization, import-boundary moves, shared/domain topology hardening, and rename-heavy QA guardrail design.
---

# Topology Plan Review

Use this skill for a large bounded move, either as pre-implementation planning or as independent review of the completed green candidate. It complements Architecture Code Review by focusing on stable owner placement, complete move fallout, collision-safe mechanics, and proof-map integrity.

## Required Reference

Read [`references/topology-plan-review-checklist.md`](references/topology-plan-review-checklist.md) completely before producing findings.

## Modes

- `planning`: before implementation, validate a complete bounded manifest and move-planning bundle. This is not the required closeout review and does not require a green checkpoint.
- `candidate review`: after implementation, review the supplied complete candidate only after applicable harness proof and `qa:checkpoint` are green.
- `wrapper diagnosis`: analyze supplied wrapper output to classify a predictable manifest omission, local defect, false positive, or missing deterministic guard. Do not run the wrapper.

## Inputs

Run as an independent read-only agent without inherited context. Receive the selected root/seam, current inventory, target owner map, complete old-to-new manifest, collision/facade decisions, consumer/dependent-map inventory, rollback, proof map, mode, and supplied QA results. Do not receive intended conclusions.

## Workflow

1. Read `AGENTS.md`, `docs/engineering/implementation-rules.md`, `docs/architecture/repository-overview.md`, `docs/architecture/code-organization.md`, the supplied bundle, and the required checklist.
2. Verify that the scope is one coherent ownership result and that the manifest covers the complete selected root/seam rather than a representative sample.
3. Verify that the manifest is bounded by the frozen acceptance criteria and does not promise unrelated hardening or stronger runtime guarantees.
4. Classify affected paths as major areas, owned seams, owner-local roles, platform/contract owners, compatibility facades, or legacy debt.
5. Verify consumers, import directions, mocks, source-reading paths, docs, registries, policy, focused-proof maps, build inputs, collisions, rollback, and negative proof.
6. In candidate-review mode, confirm supplied green proof and compare the implemented diff with the approved bundle.

## Analysis-Only Rules

- Do not edit files or run `npm`, QA wrappers, formatters, linters, code generation, automated rewrites, staging, or destructive commands.
- Inspect source, diffs, docs, owner maps, registries, tests, and supplied QA output.
- State evidence paths and identify inference as inference.

## Output Contract

List findings first, highest severity first, with evidence, violated invariant, reproducible failure/risk, and minimal correction class. Then state manifest completeness, topology posture, move-mechanic/proof-map posture, residual assumptions, and one decision: `Approve`, `Approve with comments`, or `Request changes`.

Planning approval means the bundle is complete enough to implement without discovering predictable path, collision, consumer, or proof fallout through wrappers. Candidate approval means the diff matches that bundle and the supplied proof is green. Classify findings as current-wave regressions, direct acceptance blockers, provable security issues, or pre-existing hardening; only the first three may produce `Request changes`. Do not demand unrelated next-phase work. If correction would add new runtime contracts, touch all persistence writers, or spread across dozens of additional owners, require a return to the minimal correction class rather than automatic scope growth.
