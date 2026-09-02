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

Required closeout review starts only after the supplied bounded manifest is complete and applicable harness proof plus `qa:checkpoint` are green. The orchestrator must spawn a new independent read-only reviewer with `fork_turns: "none"` and must not reuse an agent that saw implementation context. The initial task must contain the explicit bounded manifest/completion matrix, exact current diff scope, preflight shape, QA results, known failures, and affected consumers; do not receive intended conclusions.

## Workflow

1. Read `AGENTS.md`, the supplied bounded manifest, and completion matrix.
2. Read `docs/engineering/implementation-rules.md`, `docs/architecture/repository-overview.md`, and the deeper architecture/design documents mapped by `AGENTS.md` for the touched seam.
3. Read the required checklist and inspect the supplied scope plus nearby owner boundaries needed to validate mixed ownership, cohesion, whether an apparent split merely distributes one god-object, and whether an apparent consolidation merely exchanges fragmentation for a monolith.
4. Confirm that required proof is green. Do not rerun wrappers or demand receipt hashes.
5. Classify every candidate finding by the first matching definition in `AGENTS.md`, in this exact order: `security issue`, `current regression`, `acceptance blocker`, `pre-existing hardening`. Report pre-existing hardening only when it is evidenced and materially relevant to the verdict, or when the user explicitly requested a broader inventory; otherwise omit it.

## Analysis-Only Rules

- Do not edit files or run `npm`, QA wrappers, formatters, linters, code generation, automated rewrites, staging, or destructive commands.
- Inspect code, contracts, documentation, and supplied QA output.
- State evidence paths and identify any inference as inference.

## Output Contract

List findings first, highest severity first, with file/line evidence, violated invariant, reproducible risk, closeout impact, and minimal correction class. A finding that asks for new behavior, state, recovery, compatibility, or proof must identify the concrete reachable trigger, material impact, and connection to frozen acceptance or an existing invariant; omit theoretical possibilities unless the user explicitly requested a speculative-hardening inventory. Review the owner/change-reason cluster and classify the implemented form as `Split`, `Consolidate`, or `Keep`; compare navigation transitions, facade/proxy layers, public surface, state authorities, effects/recovery, cohesion, and current stable change reasons rather than raw file count or hypothetical future extensibility. If supplied maintenance evidence contains overlapping forwarding-edge candidates, require every forwarding-only single-production-consumer edge to have a stable `Consolidate` target or an explicit boundary-based `Keep` reason. Distinguish a cohesive registered transaction/workflow owner from mixed orchestration: state, effects, and recovery are not defects by themselves when the function stays in one domain, calls narrow adapters, excludes UI authority, and avoids arbitrary branching. Then list residual assumptions, missing QA context, architecture posture, and one decision: `Approve`, `Approve with comments`, `Request changes`, or `Needs security review`.

Use `Request changes` only for an evidenced `security issue`, `current regression`, or `acceptance blocker`. Omit wishlist items, extra tests not required by the frozen acceptance criteria, and unrelated repository defects. Pre-existing hardening follows the evidence-and-relevance rule above. Prefer the minimal correction class inside the supplied manifest; if a fix would introduce new runtime contracts, touch all persistence writers, or spread across dozens of additional owners, identify the scope escape instead of silently broadening the candidate. State whether a correction changes the reviewed behavior, owner, public contract, dependency direction, parser semantics, or topology and therefore requires another review; mechanical cleanup alone does not.
