---
name: architecture-code-review
description: Use only for analysis-only review when a Sniptale diff actually changes runtime ownership, state/public contracts, dependency direction, parser semantics, UI/i18n/design-system ownership, or notable topology.
---

# Architecture Code Review

Use this skill for independent read-only review of a complete candidate whose current diff actually changes an architecture seam: runtime ownership, state/public contracts, dependency direction, parser semantics, UI/i18n/design-system ownership, or notable topology. It checks those changed seams and their deterministic proof. Use Security Code Review when the primary changed risk is privilege, sensitive data, authorization, sanitization, import/export trust, or manifest permissions.

Do not invoke this skill for owner-local extraction, test/proof-only changes, literal clone removal, formatting, generated-data refresh, or mechanical moves that preserve behavior, ownership, contracts, dependency direction, parser semantics, and topology. A large diff or missing proof alone does not create an architecture-review requirement.

## Required Reference

Read [`references/architecture-review-checklist.md`](references/architecture-review-checklist.md) completely before producing findings.

## Inputs And Timing

Required closeout review starts only after the supplied bounded manifest is complete and applicable harness proof plus `qa:checkpoint` are green. Run as an independent read-only agent without inherited context. Receive explicit files/diff, completion matrix, preflight shape, QA result, known failures, and affected consumers; do not receive intended conclusions.

## Workflow

1. Read `AGENTS.md`, the supplied bounded manifest, and completion matrix.
2. Read `docs/engineering/implementation-rules.md`, `docs/architecture/repository-overview.md`, and the deeper architecture/design documents mapped by `AGENTS.md` for the touched seam.
3. Read the required checklist and inspect the supplied scope plus nearby owner boundaries needed to validate it.
4. Confirm that required proof is green. Do not rerun wrappers or demand receipt hashes.
5. Classify every candidate finding as a current-wave regression, direct acceptance blocker, provable security issue, or pre-existing hardening. Report pre-existing hardening as comments/debt, not current-wave corrections.

## Analysis-Only Rules

- Do not edit files or run `npm`, QA wrappers, formatters, linters, code generation, automated rewrites, staging, or destructive commands.
- Inspect code, contracts, documentation, and supplied QA output.
- State evidence paths and identify any inference as inference.

## Output Contract

List findings first, highest severity first, with file/line evidence, violated invariant, reproducible risk, closeout impact, and minimal correction class. Then list residual assumptions, missing QA context, architecture posture, and one decision: `Approve`, `Approve with comments`, `Request changes`, or `Needs security review`.

Use `Request changes` only for evidenced current-wave regressions, direct acceptance blockers, or provable security issues. Wishlist items, extra tests not required by the frozen acceptance criteria, pre-existing hardening, and unrelated repository defects are comments. Prefer the minimal correction class inside the supplied manifest; if a fix would introduce new runtime contracts, touch all persistence writers, or spread across dozens of additional owners, identify the scope escape instead of silently broadening the candidate. State whether a correction changes the reviewed behavior, owner, public contract, dependency direction, parser semantics, or topology and therefore requires another review; mechanical cleanup alone does not.
