---
name: repo-audit
description: Use only when explicitly asked to audit the whole Sniptale repository for security, architecture, tooling, documentation, and QA guardrail alignment.
---

# Repo Audit

Use this skill only for an explicitly requested whole-repository audit. It combines architecture, security, tooling, documentation, and deterministic-QA review. Use focused review skills for bounded change sets.

## Required Reference

Read [`references/repo-audit-checklist.md`](references/repo-audit-checklist.md) completely before producing findings.

## Invocation And Evidence

Run as an independent read-only agent without inherited context. Receive the explicit audit scope, acceptance criteria, supplied QA/audit results, known exclusions, and relevant repository state; do not receive intended conclusions.

Read `AGENTS.md`, `docs/architecture/repository-overview.md`, `docs/engineering/implementation-rules.md`, `docs/security/data-handling.md`, `docs/tooling/code-quality.md`, `docs/tooling/wrapper-summary.md`, and the required checklist. Historical documents are evidence, never current authority.

Build an evidence map from source, active documentation, package scripts, wrappers, QA policy data, and supplied output. QA validation manifests live under `tooling/configs/qa/validation-manifest.json`; the legacy core location is not authoritative.

For final whole-repository acceptance, require supplied green `qa:audit` followed by green `qa:e2e`; run the Repo Audit review after both so its verdict is the last acceptance action.

## Analysis-Only Rules

- Do not edit files or run `npm`, QA wrappers, formatters, linters, code generation, automated rewrites, staging, or destructive commands.
- Do not request blanket reruns or proof-receipt hashes when relevant supplied proof is green.
- State evidence paths, label inference, and distinguish unverified areas from findings.

## Output Contract

Use this order: concise verdict; critical problems; architecture/security findings; tooling/wrapper/documentation drift; deterministic-QA recommendations; evidence inspected; residual assumptions and unverified areas.

Classify every finding as a current-wave regression, direct acceptance blocker, provable security issue, or pre-existing hardening. Every blocker belongs to one of the first three categories and identifies the violated acceptance criterion, file evidence, reproducible risk, why it blocks the requested acceptance rather than being an improvement, and the minimal correction class. Label pre-existing hardening and unrelated defects as recommendations, not `Request changes`. If a correction would introduce new runtime contracts, touch all persistence writers, or spread across dozens of additional owners, flag scope escape and return to the minimal correction class.
