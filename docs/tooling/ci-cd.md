# Canonical CI/CD

Updated: 2026-08-19

This document owns the external execution topology, admission rules, proof transport, artifact retention, and release publication contract. Wrapper behavior remains owned by [wrapper-summary.md](wrapper-summary.md), operator commands by [operator-handbook.md](operator-handbook.md), and quality controls by [code-quality.md](code-quality.md).

## One QA Authority

GitHub Actions does not define a second QA pipeline. Local work and external jobs invoke the same `qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `qa:release`, and `qa:audit` owners from the locked QA image. Workflow YAML selects the lane, transports verified receipts, publishes artifacts, and manages the external runner; it does not redefine control composition, thresholds, scopes, baselines, or success.

Local `qa:*` commands run directly on the developer machine. `ci:release`, `ci:security`, `ci:coverage`, and `ci:proof` are local container adapters for reproducing the locked Linux/amd64 environment. Selectel is only an executor for GitHub Actions. Resource differences are allowed and are recorded in proof; they do not change the selected blocking controls.

The trusted control plane for a pull request is the base commit loaded by `pull_request_target`. Candidate code is checked out separately without credentials and represented as an uncommitted diff over the exact base in a disposable workspace. Literal `qa:closeout` may commit only inside that workspace. The host then requires the resulting parent and tree to equal the admitted base and candidate tree before restoring the exact candidate commit for commit-bound phases. Candidate changes to workflows or QA controls may build an informational image, but they cannot decide their own required result.

## Selectel Runner Lifecycle

Both existing workflows use one topology:

```text
provision → canonical-qa or release-audit → artifact upload → cleanup
```

The `SELECTEL_QA_PROFILES` variable in the protected `selectel-runner-controller` GitHub environment is the runtime authority for ordered Selectel placements and QA resource budgets. The repository contains only the bounded schema and allowed zone, flavor, volume, and resource combinations. `ci:github:plan` and `ci:github:apply` require the variable, validate it, and retain only its environment, SHA-256, and profile count in the sanitized settings snapshot.

The controller validates the complete JSON before cloud access, normalizes it, hashes it, and tries profiles strictly in order. It may advance only after a confirmed infrastructure admission or provisioning failure and verified deletion of every partial VM, boot volume, port, and JIT registration. Cleanup failure stops fallback. The first online JIT runner ends provisioning, and no fallback is permitted after canonical QA begins. QA failure, runner loss, or timeout remains a failure for that candidate and proceeds to cleanup. The independent tag/TTL sweeper removes expired managed resources and offline disposable registrations.

The selected profile maps to `SNIPTALE_QA_CPU_TOKENS`, `SNIPTALE_QA_MEMORY_MIB`, `SNIPTALE_QA_VITEST_MAX_WORKERS`, `SNIPTALE_QA_PLAYWRIGHT_WORKERS`, and `SNIPTALE_QA_SECURITY_WORKERS`. Controller records and QA proof contain the normalized profile digest, zero-based selected profile index, zone, flavor, volume type and size, resource values, candidate/base/trusted-control commits, immutable QA image reference, region, and only a shortened SHA-256 of the Selectel project ID. Credentials, the raw project ID, JIT config, cloud-init body, and registry token are never artifacts.

## Pull Request Gate

A ready pull request runs the complete candidate-bound sequence:

```text
qa:release-harness
→ qa:checkpoint
→ literal qa:closeout
→ candidate tree equality
→ qa:release
→ qa:audit --profile pr
→ qa:audit --profile security
→ qa:audit --profile coverage
→ release artifact validation
```

The `pr` audit profile requires Gitleaks worktree scanning, npm audit, npm signature verification, OSV Scanner, and Semgrep. The following security and coverage phases add full CodeQL and full product coverage as blocking controls. A matching receipt is reused by the same QA owner; a missing, stale, malformed, or differently bound receipt triggers full recomputation. The final required `pr-gate` succeeds only when every canonical control and external cleanup succeed.

The canonical artifact is uploaded before cleanup even when QA fails. Its job summary identifies the selected profile, profile digest, resolved resources, failed phase, artifact link, and exact `gh run download` command. PR artifacts are retained for 14 days.

## Main And Scheduled Audit

A push to `main` runs the same complete canonical lane for the exact squash commit, including blocking security and coverage. A green proof publishes the already built QA and controller images under immutable `sha-<commit>` tags and moving `main` tags with OCI SBOM and provenance. Main artifacts are retained for 30 days and are the preferred proof-reuse source for the next PR and release of the same inputs.

The weekly schedule and a normal `workflow_dispatch` execute the same complete lane to detect advisory or environment drift even when no candidate changed. SARIF upload and Codecov remain result presentation, not independent authorities. A Codecov outage is non-blocking. Scheduled/manual results are early warning and reusable evidence; they do not replace release admission.

## Verified Proof Reuse

Proof reuse is a fail-closed QA-owner decision, not a cache hit decided by YAML. The full-unit receipt binds product sources, tests, support, runner inputs, dependencies, Node/container identity, suite, pool, worker count, and resource profile. The CodeQL receipt binds production source scope, query packs, configuration, baseline, toolchain/image identity, and the filtered SARIF digest. The coverage receipt binds production sources, tests, coverage scope/configuration, dependency lock, image identity, and every canonical coverage report digest.

README, release notes, and unrelated documentation do not invalidate CodeQL or coverage receipts. A changed input, missing report, malformed receipt, changed image digest, or artifact hash mismatch rejects reuse. Every blocking PR, main, scheduled, manual, or release lane then performs the full control.

## Release Admission And Assets

`release.yml` accepts only a GitHub-verified annotated `v<package.json version>` tag whose commit belongs to `main`, whose exact successful main proof exists, and whose immutable QA/controller images exist. The release audit uses one disposable Selectel runner and requires the complete `release` audit profile. CodeQL and coverage first attempt verified reuse and otherwise run fully. Missing, stale, corrupt, or differently bound proof fails closed through full recomputation or failed admission.

Publication consumes the already verified extension ZIP rather than rebuilding it. It creates a mutable draft, uploads and verifies the exact asset set and GitHub-computed digests, then publishes and verifies the immutable release. Canonical assets include the extension ZIP, `SHA256SUMS`, CycloneDX SBOM, main and release-audit proof manifests, provenance, CodeQL and Semgrep SARIF, LCOV, filtered coverage JSON, summary JSON, CodeQL and coverage receipts, and an archived HTML coverage report. Release notes are generated inline by the workflow from the verified ZIP name; no repository release-notes file is created.

## Failure Handling And Bypass

Wrapper logs, run records, phase receipts, proof status, hashes, and available reports are collected even after a normal QA failure. Cleanup is a separate controller job and must confirm absence or deletion of the JIT registration, VM, volume, and port. A runner disappearing before it can upload local files is an infrastructure failure; the controller record and independent sweeper remain the recovery authorities.

When GitHub resources are unavailable, the owner may run `npm run ci:proof -- --pr <number>` with optional local resource flags. It requires a clean worktree, exact local/remote PR SHA, trusted image/control identity, and complete local proof, then posts only the proof summary and digests. Merge remains a manual native GitHub PR-only ruleset bypass; the proof command never merges.

Repository policy uses read-only default `GITHUB_TOKEN`, full-SHA Action pins, the selected Action allowlist, enabled vulnerability alerts and security updates, immutable releases, squash/linear-history protection, required `pr-gate`, and the owner-only PR bypass. `ci:github:apply` writes a sanitized rollback snapshot before changes; restore requires that exact snapshot path.
