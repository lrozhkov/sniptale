---
name: repo-audit
description: Use only when explicitly asked to audit the whole Sniptale repository for security, architecture, tooling, documentation, and QA guardrail alignment.
---

# Repo Audit

Use this skill only for an explicitly requested whole-repository audit. It combines architecture, security, tooling, documentation, and deterministic-QA review. Use focused review skills for bounded change sets.

## Required Reference

Read [`references/repo-audit-checklist.md`](references/repo-audit-checklist.md) completely before producing findings.

## Invocation And Evidence

The orchestrator must spawn a new independent read-only auditor with `fork_turns: "none"` and must not reuse an agent that saw the audited implementation context. The initial task must contain the explicit bounded audit manifest, exact repository/diff scope, acceptance criteria, supplied QA/audit results, known exclusions, and relevant repository state; do not receive intended conclusions.

Read `AGENTS.md`, `docs/architecture/repository-overview.md`, `docs/engineering/implementation-rules.md`, `docs/security/data-handling.md`, `docs/tooling/code-quality.md`, `docs/tooling/wrapper-summary.md`, and the required checklist. Use VCS history when historical evidence is needed; do not retain an active documentation archive.

Build an evidence map from source, active documentation, package scripts, wrappers, QA policy data, derived control inventory, and supplied output. The canonical catalog and derived executable/policy closure own QA structure; a hand-maintained control-to-test validation manifest is not an authority. Audit structural/advisory/topology-fragmentation policy drift across source, catalogs, lanes, artifact schemas, and active guidance, but do not launch a repository-wide structural detector or collect model-token/token-hotspot inventories. A separately supplied manual `qa:structural-audit` artifact may provide report-only `Split`/`Consolidate`/`Keep` maintenance evidence through a disjoint path-owner partition and explicitly overlapping forwarding-edge candidates; every forwarding-only single-production-consumer edge needs `Consolidate` or an explicit boundary-based `Keep` reason. The artifact is never whole-repository acceptance proof.

For final whole-repository acceptance, require supplied green results from the canonical wrappers selected by `AGENTS.md` and current QA routing. Require `qa:e2e` only when runtime E2E is part of the user's acceptance criteria. Run Repo Audit after the supplied proof so its verdict is the last review action.

## Analysis-Only Rules

- Do not edit files or run `npm`, QA wrappers, structural detectors, formatters, linters, code generation, automated rewrites, staging, or destructive commands.
- Do not request blanket reruns or proof-receipt hashes when relevant supplied proof is green.
- State evidence paths, label inference, and distinguish unverified areas from findings.

## Output Contract

Use this order: concise verdict; critical problems; architecture/security findings; tooling/wrapper/documentation drift; deterministic-QA recommendations; evidence inspected; residual assumptions and unverified areas. A recommendation that adds behavior, recovery, compatibility, policy, or a deterministic guard must identify a concrete reachable scenario or repeated observed defect, its material impact, and why an existing owner or control does not already contain it. Omit a theoretical bypass or stronger imaginable guarantee unless the user explicitly requested speculative-hardening research.

Classify every finding by the first matching definition in `AGENTS.md`, in this exact order: `security issue`, `current regression`, `acceptance blocker`, `pre-existing hardening`. Every blocker belongs to one of the first three categories and identifies the violated acceptance criterion, file evidence, reproducible risk, why it blocks the requested acceptance rather than being an improvement, and the minimal correction class. Label pre-existing hardening and unrelated defects as recommendations, not `Request changes`. If a correction would introduce new runtime contracts, touch all persistence writers, or spread across dozens of additional owners, flag scope escape and return to the minimal correction class.
