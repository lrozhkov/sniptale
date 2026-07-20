---
name: security-code-review
description: Use only for analysis-only review when a Sniptale diff actually changes a trust boundary, authorization, privileged API use, sanitization/import-export policy, secrets, retention, privacy behavior, manifest permissions, or MV3 lifecycle authority.
---

# Security Code Review

Use this skill for independent read-only security/privacy review of a complete candidate whose current diff actually changes a security seam: trust boundaries, authorization, privileged browser APIs, sanitization/import-export policy, secrets, retention, privacy behavior, manifest permissions, or MV3 lifecycle authority. Review only the changed seam and its proof. Use Architecture Code Review for actual changes to ownership, state/public contracts, dependency direction, parser semantics, UI/i18n/design-system ownership, or notable topology.

Do not invoke this skill for test/proof-only changes, literal clone removal, formatting, generated-data refresh, or mechanical extraction that preserves security policy and authority. Security-sensitive code being nearby is not sufficient when the diff does not change its trust or authorization behavior.

## Required Reference

Read [`references/security-review-checklist.md`](references/security-review-checklist.md) completely before producing findings.

## Inputs And Timing

Required closeout review starts only after the supplied bounded manifest is complete and applicable harness proof plus `qa:checkpoint` are green. Run as an independent read-only agent without inherited context. Receive explicit files/diff, completion matrix, preflight shape, QA result, known failures, and affected trust boundaries; do not receive intended conclusions.

## Workflow

1. Read `AGENTS.md`, the supplied bounded manifest, `docs/security/threat-model.md`, and `docs/engineering/implementation-rules.md`.
2. Read `docs/security/data-handling.md` and deeper documents mapped by `AGENTS.md` for the touched seam.
3. Read the required checklist and inspect the supplied scope plus nearby trust-boundary owners needed to validate it.
4. Confirm that required proof is green. Do not rerun wrappers or demand receipt hashes.
5. Classify every candidate finding as a current-wave regression, direct acceptance blocker, provable security issue, or pre-existing hardening. Report pre-existing hardening as comments/debt, not current-wave corrections.

## Analysis-Only Rules

- Do not edit files or run `npm`, QA wrappers, formatters, linters, code generation, automated rewrites, staging, or destructive commands.
- Inspect code, contracts, documentation, and supplied QA output.
- State evidence paths and identify any inference as inference.

## Output Contract

List findings first, highest severity first, with file/line evidence, violated invariant, reproducible risk, closeout impact, and minimal correction class. Then list residual assumptions, missing QA context, security posture, and one decision: `Approve`, `Approve with comments`, `Request changes`, or `Needs architecture review`.

Use `Request changes` only for evidenced current-wave regressions, direct acceptance blockers, or provable security issues. Defense-in-depth wishes, extra tests not required by the frozen acceptance criteria, pre-existing hardening, and unrelated repository defects are comments. Prefer the minimal correction class inside the supplied manifest; if a fix would introduce new runtime contracts, touch all persistence writers, or spread across dozens of additional owners, identify the scope escape instead of silently broadening the candidate. State whether a correction changes behavior, authority, or a security seam and therefore requires another review; mechanical cleanup alone does not.
