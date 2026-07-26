# Operator Handbook

Updated: 2026-07-25

Short command and review-skill lookup. Workflow belongs in [AGENTS.md](../../AGENTS.md), implementation decisions in [implementation-rules.md](../engineering/implementation-rules.md), quality policy in [code-quality.md](code-quality.md), and wrapper lifecycle in [wrapper-summary.md](wrapper-summary.md).

## Canonical Entrypoints

| Need | Command | Notes |
| --- | --- | --- |
| Read-only context | `npm run qa:preflight` | Accepts `-- --files <paths...>` before a diff exists. |
| In-progress product proof | `npm run qa:checkpoint` | Focused current-diff gate; does not build or commit. |
| Harness/shared-control proof | `npm run qa:release-harness` | Required for `tooling/**`, `.github/workflows/**`, `.agents/**`, `AGENTS.md`, hooks, QA-affecting root/config files, and active `docs/tooling/**` guidance. |
| Normal implementation closeout | `npm run qa:closeout -- -m "message"` | Owns checkpoint/build handoff, staging, task-artifact guard, and commit. |
| Publish committed changes | `git push` | The pre-push hook proves the immutable pushed range with checkpoint/build and applicable harness verification; it never promotes a new branch push to `qa:release` or `build:release`. |
| Release-grade product proof | `npm run qa:release` | Release preparation or explicit audit-grade proof. |
| Unpacked release-mode build | `npm run build:release` | Runs only Vite in release mode and writes `dist/`; does not typecheck, run QA, or package an archive. |
| Package current release build | `npm run release:package-only` | Debug/package-only path; does not replace `qa:release`. |
| Repository audit | `npm run qa:audit` | Manual audit profiles, full coverage, evidence, supply-chain checks, and external engines. |
| Structural/topology maintenance snapshot | `npm run qa:structural-audit` | Manual report-only path-owner plus forwarding-edge fragmentation snapshot; not a PR, agent, closeout, or `qa:audit` gate. |
| Extension smoke | `npm run qa:e2e` | Separate Playwright runtime acceptance path. |
| Wrapper statistics | `npm run qa:stats -- [--wrapper <id>] [--task <id>]` | Reads structured run records. |
| WSL setup/recovery | [wsl-setup.md](wsl-setup.md) | Environment setup only. |

The live harness/shared-control classifier is `tooling/qa/core/qa-scope.mjs`; this table summarizes it. Machine-owned files explicitly marked inventory-only, including exact coverage rollout paths, use checkpoint owner validation without a fresh harness stamp. Changing matching, thresholds, traversal, or wrapper behavior still requires release-harness proof.

Checkpoint and closeout choose unit-test profiles automatically. Small low-risk diffs with complete focused owner mappings run exact direct tests; a deleted consolidation also runs exact surviving owner tests when its complete previous-consumer and current-redirect closure stays inside one owner, every surviving changed production file has deterministic proof, and the owner-test set remains bounded. High-risk, public/shared, cross-owner, transitive, ambiguous, uncovered, or over-budget diffs retain Vitest affected-consumer discovery. The focused owner-expansion budget bounds transitively selected owner tests, while every changed direct test remains mandatory proof and does not consume that expansion budget. Inspect the `Unit tests` detail in the run log for `profile=...`; do not add a manual force-narrow flag.

Checkpoint formatting is always sequential and finishes before any verification lane starts. After that barrier, wrappers select a bounded WSL-visible profile. The default checkpoint and `bounded-concurrent` build-test caps are 8 CPU tokens, 12 GiB estimated resident memory, and 4 concurrent Vitest workers. An explicit measured Vitest override may raise that normal worker cap to 6 when the CPU budget permits. A build/closeout test scope classified as `saturated-exclusive` and `qa:release` are intentionally different: after their non-test prerequisite phase finishes, Vitest runs as a second exclusive phase with up to 12 WSL-visible CPU tokens, 12 workers, and all visible WSL memory except 1 GiB. Full-suite fallback, related closures above 32 inputs, and measured package/app-core, messaging-runtime, and parser/snapshot/export fan-out use that saturated class. Build remains exclusive after tests. Operator overrides are positive integers: `SNIPTALE_QA_CPU_TOKENS`, `SNIPTALE_QA_MEMORY_MIB`, and `SNIPTALE_QA_VITEST_MAX_WORKERS`; they can reduce saturation when Windows is busy. The release profile requires at least 2 CPU tokens, while its memory budget has a 6144 MiB minimum because the scheduler retains the real heavy-lane reservations instead of relabelling them as smaller work. Overrides are clamped to resources visible inside WSL and never mean `auto`.

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
| Diff structural risk | `node tooling/qa/core/verify-structural-risk.mjs` |
| Task artifacts | `node tooling/qa/core/verify-task-artifacts.mjs` |

Repo-wide audit inventory belongs in `qa:audit` unless a failed stage requires a direct adapter. Successful inventory steps break down their finding families and atomically replace sanitized complete artifacts at `.tmp/repo-audit/evidence.json` and `.tmp/repo-audit/topology.json`; Semgrep and npm evidence is written to `.tmp/semgrep/results.json`, `.tmp/npm-audit/results.json`, and `.tmp/npm-audit/signatures.json`. Structural debt is deliberately separate: an operator may run `qa:structural-audit` for periodic architecture maintenance, but agents do not run it as implementation proof and its report never blocks. Its path-owner partition and overlapping forwarding-edge candidates have separate counts; every forwarding-only single-production-consumer edge is either `Consolidate` or an explicit `Keep` veto. Neither inventory collects model-token hotspots. Raw binary entrypoints are finite `qa:raw:*` package scripts; inspect `package.json` rather than assuming an arbitrary wildcard command exists.

## Environment Rules

- Run Linux-side `npm run ...` and `npm exec ...` from WSL; do not use Windows `cmd /c npm ...` or bare `npx ...`.
- If temporary-directory permissions fail, retry with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`.
- Treat `.wslconfig` CPU and memory values as VM ceilings, not dedicated resources. Windows and WSL still compete for the same physical cores, so do not set QA limits from the 12 logical-thread count alone.
- External audit binaries use `PATH` or `SNIPTALE_SEMGREP_BIN`, `SNIPTALE_CODEQL_BIN`, `SNIPTALE_OSV_SCANNER_BIN`, and `SNIPTALE_GITLEAKS_BIN` overrides.
- Treat DNS, proxy, TLS, registry, browser-dependency, and missing-binary failures as environment failures, not product regressions.
- Do not manually stage the closeout candidate or stage `tasks/**`.
