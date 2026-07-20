# Operator Handbook

Updated: 2026-07-16

Short command and review-skill lookup. Workflow belongs in [AGENTS.md](../../AGENTS.md), implementation decisions in [implementation-rules.md](../engineering/implementation-rules.md), quality policy in [code-quality.md](code-quality.md), and wrapper lifecycle in [wrapper-summary.md](wrapper-summary.md).

## Canonical Entrypoints

| Need | Command | Notes |
| --- | --- | --- |
| Read-only context | `npm run qa:preflight` | Accepts `-- --files <paths...>` before a diff exists. |
| In-progress product proof | `npm run qa:checkpoint` | Focused current-diff gate; does not build or commit. |
| Harness/shared-control proof | `npm run qa:release-harness` | Required for `tooling/**`, `.agents/**`, `AGENTS.md`, hooks, QA-affecting root/config files, and active `docs/tooling/**` guidance. |
| Normal implementation closeout | `npm run qa:closeout -- -m "message"` | Owns checkpoint/build handoff, staging, task-artifact guard, and commit. |
| Release-grade product proof | `npm run qa:release` | Release preparation or explicit audit-grade proof. |
| Unpacked release-mode build | `npm run build:release` | Runs only Vite in release mode and writes `dist/`; does not typecheck, run QA, or package an archive. |
| Package current release build | `npm run release:package-only` | Debug/package-only path; does not replace `qa:release`. |
| Repository audit | `npm run qa:audit` | Manual audit profiles, full coverage, evidence, supply-chain checks, and external engines. |
| Extension smoke | `npm run qa:e2e` | Separate Playwright runtime acceptance path. |
| Wrapper statistics | `npm run qa:stats -- [--wrapper <id>] [--task <id>]` | Reads structured run records. |
| WSL setup/recovery | [wsl-setup.md](wsl-setup.md) | Environment setup only. |

The live harness/shared-control classifier is `tooling/qa/core/qa-scope.mjs`; this table summarizes it.

Checkpoint and closeout choose unit-test profiles automatically. Small low-risk diffs with complete focused owner mappings run exact direct tests; high-risk, public/shared, transitive, ambiguous, or over-budget diffs retain Vitest affected-consumer discovery. The focused owner-expansion budget bounds transitively selected owner tests, while every changed direct test remains mandatory proof and does not consume that expansion budget. Inspect the `Unit tests` detail in the run log for `profile=...`; do not add a manual force-narrow flag.

## Review Skills

| Skill | Use |
| --- | --- |
| [Security Code Review](../../.agents/skills/security-code-review/SKILL.md) | Privilege, trust, privacy, secrets, AI/data, import/export, sanitization, and manifest risk. |
| [Architecture Code Review](../../.agents/skills/architecture-code-review/SKILL.md) | Runtime ownership, contracts, state authority, parser, UI/i18n/design-system, and broad topology risk. |
| [Topology Plan Review](../../.agents/skills/topology-plan-review/SKILL.md) | Pre-move bounded-manifest planning or independent review of a completed green large move. |
| [Repo Audit](../../.agents/skills/repo-audit/SKILL.md) | Explicit whole-repository architecture/security/tooling/documentation audit only. |

Required closeout reviews run as independent read-only agents without inherited context only after the complete candidate and applicable harness plus checkpoint proof are green. Invoke them only when the current diff actually changes the skill's risk seam; owner-local extraction, test/proof-only changes, literal clone removal, and mechanical moves that preserve behavior, ownership, contracts, dependency direction, parser semantics, and security authority close as `not required: low-risk change`. Topology planning mode may run before implementation and is not the required closeout review.

Use both focused review skills when both architecture and security risk are material. Repo Audit does not replace bounded reviews unless the user explicitly requested a whole-repository audit.

For an explicitly requested final whole-repository acceptance, use `npm run qa:audit`, then `npm run qa:e2e`, then invoke the independent Repo Audit review with both green results. The Repo Audit verdict is the last acceptance action; running later repository-wide proof makes the earlier verdict stale.

## Direct Debug Commands

Use direct commands only to investigate a specific wrapper failure or answer an explicit operator question. Do not stack them on normal closeout.

| Area | Command |
| --- | --- |
| Config baseline | `node tooling/qa/core/verify-config-policy.mjs` |
| Typecheck | `node tooling/qa/core/verify-typecheck.mjs` |
| ESLint | `node tooling/qa/core/verify-eslint.mjs` |
| SonarJS | `node tooling/qa/core/verify-sonarjs.mjs --files <paths...>` |
| Build | `node tooling/qa/core/verify-build.mjs` |
| Security guardrails | `node tooling/qa/guards/security/verify-security.mjs` |
| Runtime boundaries | `node tooling/qa/guards/architecture/verify-boundaries.mjs` |
| Runtime topology | `node tooling/qa/guards/architecture/verify-runtime-topology.mjs` |
| Manifest permissions | `node tooling/qa/guards/architecture/verify-manifest-permissions.mjs` |
| Cycles | `node tooling/qa/guards/architecture/verify-cycles.mjs` |
| i18n | `node tooling/qa/core/verify-i18n.mjs` |
| Design system | `node tooling/qa/core/verify-design-system.mjs` |
| Canonical facades | `node tooling/qa/core/verify-canonical-facades.mjs` |
| Line length | `node tooling/qa/guards/quality/verify-line-length.mjs` |
| Task artifacts | `node tooling/qa/core/verify-task-artifacts.mjs` |

Repo-wide report-only inventory belongs in `qa:audit` unless a failed stage requires a direct adapter. Successful inventory steps break down their finding families and atomically replace sanitized complete artifacts at `.tmp/repo-audit/evidence.json` and `.tmp/repo-audit/topology.json`; Semgrep and npm evidence is written to `.tmp/semgrep/results.json`, `.tmp/npm-audit/results.json`, and `.tmp/npm-audit/signatures.json`. Findings remain visible without turning report-only naming or heuristic controls into hard-fail gates. Raw binary entrypoints are finite `qa:raw:*` package scripts; inspect `package.json` rather than assuming an arbitrary wildcard command exists.

## Environment Rules

- Run Linux-side `npm run ...` and `npm exec ...` from WSL; do not use Windows `cmd /c npm ...` or bare `npx ...`.
- If temporary-directory permissions fail, retry with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`.
- External audit binaries use `PATH` or `SNIPTALE_SEMGREP_BIN`, `SNIPTALE_CODEQL_BIN`, `SNIPTALE_OSV_SCANNER_BIN`, and `SNIPTALE_GITLEAKS_BIN` overrides.
- Treat DNS, proxy, TLS, registry, browser-dependency, and missing-binary failures as environment failures, not product regressions.
- Do not manually stage the closeout candidate or stage `tasks/**`.
