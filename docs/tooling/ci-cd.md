# Canonical CI/CD

This document owns external execution, proof transport, artifact retention, and release publication. Wrapper behavior is owned by [wrapper-summary.md](wrapper-summary.md), operator commands by [operator-handbook.md](operator-handbook.md), and changing product facts by the generated [project facts](../engineering/project-facts.md).

## One control composition

The repository has two full commit-bound owners:

- `ci:proof` proves the Fast PR Gate: static, architecture, dependency, security, build, and packaging verification plus the fast PR audit profile. It deliberately does not run the complete Vitest suite and never claims release readiness.
- `ci:release` runs the complete product verification including full Vitest, the release audit profile, canonical coverage, CodeQL, SBOM generation, and the persistence and secrets mutation profiles.

Both commands run the same JS composition and QA owners directly in WSL. GitHub runs those owners inside the pinned Linux/amd64 image on a Selectel runner. This provides semantic parity of controls and compatible receipt formats, not a promise that WSL and the image always have the same outcome: system libraries, Chromium, filesystem behavior, resource ceilings, ordering, and timing differ. The image fixes the canonical external environment; it does not own the control list. GitHub YAML supplies identity, verified reusable receipts, resources, artifact transport, and infrastructure lifecycle; it does not restate control scopes or success rules. A local dirty workspace is supported for development diagnosis and is recorded as `local-workspace`. Ordinary WSL proof is diagnostic and may support a documented operator decision, while GitHub reuse and release publication require a clean committed proof from the locked image. The clean local PR bypass also runs that image.

The diff-local development flow remains separate and unchanged: `qa:release-harness → qa:checkpoint → required review → qa:closeout`. Exactly these three public wrappers are diff-aware and optimize feedback for the current change. `ci:proof` and `ci:release` always resolve a repository-wide snapshot and never narrow controls from the diff, whether their common owner runs directly in WSL or through the locked image on Selectel. The local wrappers are not run on a separate external VM and are not a second external gate.

`ci:build` is the deliberately narrow local npm build bypass. It is not a release build, produces no canonical QA claim, and its output is never admissible for provenance or build/ZIP proof reuse.

## Continuous Integration

The existing `quality-gate.yml` has two execution modes and two bounded infrastructure diagnostics:

```text
Fast PR Gate              → ci:proof
Release provenance Gate   → exact fast proof reuse, or ci:proof on the same VM → ci:release
Selectel connectivity     → read-only controller preflight
Selectel infrastructure smoke → QA image + disposable VM/toolchain checks + complete cleanup
```

`selectel-smoke` is the first external rollout check after a CI-authority bootstrap. It uses `SELECTEL_QA_PROFILES`, provisions one disposable runner, verifies the immutable QA image, exact Node/Semgrep/CodeQL/OSV Scanner/Gitleaks/actionlint/Playwright versions, and starts every pinned Chromium/Headless Shell/FFmpeg executable so missing system libraries fail before a heavy lane. It also proves denial of container access to OpenStack metadata. It deliberately skips `npm ci`, `ci:proof`, `ci:release`, candidate proof admission, SARIF, and Codecov. Its final gate succeeds only when image resolution, provisioning, smoke checks, and the independent cleanup job all succeed. Heavy Fast and Release provenance gates are not dispatched until this smoke is green.

Ready pull requests and pushes to `main` use Fast PR Gate and `SELECTEL_QA_PROFILES`. Manual and scheduled release provenance use `SELECTEL_RELEASE_PROFILES`. Both variables have the same ordered profile schema. The controller tries profiles in order, stops at the first online runner, and may fall back only after complete cleanup of a failed provisioning attempt.

Release provenance first looks for a successful exact fast proof for the same commit, candidate tree, candidate-control digest, gate-input digest, and immutable image digest. A valid receipt records that the fast controls were already proven; full Vitest and all release-only controls still run. If the fast receipt is missing or mismatched, `ci:release` includes the missing fast controls on that same VM. It never creates a second Fast VM.

For pull requests, the workflow, mandatory control authority, phase orchestrator, artifact sealer, classifier, proof-admission envelope, final graph admission, and Selectel lifecycle controller come from the trusted base commit through `pull_request_target`. Before any candidate control executes, the trusted launcher independently recomputes both complete control digests from the candidate workspace and the read-only trusted mount, then verifies the sealed launcher assertions. The machine inventory in `tooling/ci/control-digest.mjs` covers executable control roots, root tool configuration, and recursively discovered TypeScript, Vite, Vitest, Playwright, ESLint, Prettier, PostCSS, and Tailwind configurations; its contract tests keep this closure inside the fail-closed Fast Gate registry. Normal PR execution is allowed only when the digests are byte-identical, so executing the candidate path is equivalent to executing trusted base. Candidate code never receives the workflow token, cloud credentials, OIDC capability, or authority to introduce a new required-control implementation.

When the control digest differs, the external gate fails closed before running candidate code and points to the documented CI-authority bootstrap. The candidate controls must first pass the complete local diff-aware QA, `ci:proof`, and `ci:release` sequence; the authorized owner then merges that dedicated bootstrap PR through the recorded native bypass with Actions disabled. After merge, those controls are the new trusted base. This avoids both self-approval and a duplicate external candidate workflow. Both candidate and trusted-control digests, plus the trusted-control SHA, are sealed into semantic identity.

Before provisioning Selectel, the trusted base classifier fingerprints the machine-registered product, security, dependency, build, packaging, and QA-control closure in both base and candidate. Skip is allowed only when the digests are identical, an exact successful base fast proof is available, and every changed path belongs to the explicit non-gate-only registry. Any unknown path fails closed and provisions the normal gate. Candidate documentation/OSS validators then produce an explicitly `derived-reuse` receipt; it is never represented as an executed candidate run.

The required gate accepts exactly one trusted graph: `derived proof` with all VM jobs skipped, or `VM proof + trusted admission + cleanup receipt`. Skipped jobs cannot satisfy the VM graph, and an unexpectedly executed VM job cannot satisfy the derived graph. Main fast proof publishes the already verified QA and controller images under immutable `sha-<commit>` tags and moving `main` tags with OCI SBOM and provenance.

## Proof reuse

Proof reuse is a fail-closed decision in the same QA owners, not a YAML cache shortcut.

- Unit proof binds product and test inputs, dependencies, runner configuration, semantic execution environment, suite, and pool. CPU, RAM, and worker counts are sealed as planning metadata but excluded from its semantic input digest.
- Build/ZIP proof binds product sources, public assets, manifest, workspace packages, Vite/TypeScript and package configuration, lockfile, Node/toolchain compatibility, normalized production environment inputs, legal/generated inventories, packaging owner, and exact archive bytes. It can be reused by either gate. The receipt writer requires the internal release-archive producer capability, so `ci:build` cannot produce it.
- CodeQL proof binds its production-only source scope, query packs, configuration, baseline, toolchain/image, and filtered SARIF.
- Coverage proof binds production sources, tests, coverage configuration, dependency lock, image, and canonical reports.

Documentation-only or release-note changes may reuse a matching receipt. Any changed digest, malformed or partial receipt, unknown image, or report hash mismatch triggers the full control. Tests, specs, fixtures, and generated data are excluded from the production CodeQL source digest; product code and security-relevant tooling remain included.

## Selectel lifecycle and resources

The controller writes an early provision receipt before candidate execution. Every attempt owns a disposable network, subnet, router interface, router, VM port, VM, and boot volume; only the no-ingress security group is shared. Cleanup waits for QA to stop using the runner but uses `always()`, does not depend on proof formation or proof upload succeeding, and can reconstruct its input from the early job output if artifact transport failed. It idempotently removes the JIT registration, VM, every recorded port, router interface, router, subnet, network, and boot volume after success, QA failure, or runner loss and writes each status to the summary. The scheduled tag/TTL sweeper independently discovers and removes expired resources across that complete set.

Sanitized controller and QA receipts contain the selected profile index and digest, zone, flavor, volume type/size, resource budgets, candidate/base/control identities, and immutable image reference. The Selectel project UUID is represented only by a shortened SHA-256. Credentials, raw project ID, JIT configuration, and cloud-init are never artifacts. The VM anonymously pulls the public immutable QA image, so no reusable registry or repository token enters Nova user-data. Trusted bootstrap installs and verifies a Docker forwarding deny for the OpenStack metadata address before starting the JIT runner; failure prevents candidate execution.

CPU, memory, Vitest, Playwright, and security-worker limits come from the selected profile on GitHub. Local `ci:proof` and `ci:release` accept `--cpu`, `--memory-mib`, and `--workers`; otherwise the existing resource-profile owner derives bounded values from visible WSL resources. The machine policy separates `semanticDigest`, which identifies what was checked, from `executionProfile`, which records where and with what resources it ran, and `reuseCompatibility`, which determines whether that result may seed the current canonical lane. Resources never select a different control set or enter the semantic digest, but a profile below the trusted lane minimum is diagnostic-only and cannot become release provenance or a reuse source.

Every real VM run restores the npm download cache into a runner volume, then still executes `npm ci` against the exact candidate lockfile. PR runs are restore-only. Only trusted main and release-provenance execution may save the cache, whose key includes OS, architecture, the locked Node/toolchain generation, and lockfile digest. Cache availability changes download cost only; it cannot skip installation or satisfy a control.

## Artifacts and results

Canonical proof is uploaded even after a normal lane failure. The job summary names the failed phase, selected resources, artifact link, and exact `gh run download` command. PR artifacts are retained for 14 days; main, scheduled, provenance, controller, and deployment artifacts are retained for 30 days. Immutable release assets are retained by GitHub Releases.

Fast proof contains the verified extension ZIP and build/ZIP receipt, Semgrep SARIF/JSON, dependency/security reports, wrapper run records, logs, proof manifest, and checksums. Release proof adds the full-unit receipt, CodeQL, canonical coverage JSON/LCOV/HTML, SBOM, licenses, mutation evidence, and their receipts. Raw CodeQL databases, npm caches, unfiltered engine logs, cloud secrets, and unrelated temporary files are excluded.

SARIF upload is a presentation job over the canonical artifact. Codecov upload is informational and occurs only after immutable release publication from that exact release proof. Neither service owns thresholds or changes the blocking result.

## Continuous Deployment

`release.yml` is manual deployment only and never provisions Selectel. It accepts an existing signed `v<package version>` tag and a successful Release provenance Gate run for the same commit. By default the named run must be the latest successful provenance run for that commit. An explicit older-run bypass requires an operator note, which remains in the GitHub run summary.

Admission verifies the annotated GitHub signature, package/tag match, `main` ancestry, release publisher, immutable-release setting, tag ruleset, exact provenance artifact, and all artifact hashes. Publication consumes the already verified extension ZIP; it does not rebuild or rerun QA. A failed publish can therefore be rerun without another VM.

The immutable public asset set is compact: extension ZIP, CycloneDX SBOM, deterministic QA evidence ZIP, provenance JSON, `SHA256SUMS`, and release-owned CI/coverage/release/license SVG badges. The evidence ZIP contains the detailed reports and receipts instead of publishing them as a loose file collection. The release is created as a draft, every asset and GitHub digest is verified, then the release is published and verified immutable.

## Bypass and recovery

`npm run ci:proof -- --pr <number>` is the owner-only local PR bypass proof. It requires a clean `origin/main` launcher and exact remote candidate identity, runs the same container owner, rechecks authority after execution, posts the proof digest to the PR, and never merges. The native PR-only ruleset bypass remains manual.

The bootstrap rollout order for a changed CI authority is fixed: complete the diff-aware local QA flow through `qa:closeout`, obtain green local `ci:proof`, obtain green local `ci:release`, then merge a dedicated bootstrap PR through the native bypass without dispatching a GitHub gate or provisioning a VM. Record the local proof paths and digests in that PR. Only after the new authority is on `main` may a separate version PR be created; that PR must pass the external Fast PR Gate and Release provenance Gate before deployment publishes the version. Repository Actions may be temporarily disabled only for the bounded bootstrap merge, with the sanitized policy snapshot recorded first and the exact policy restored immediately afterward.

Before the external rollout begins, the local sequence establishes one green `ci:proof` and then one green `ci:release` baseline. They are not repeated during this rollout. After bootstrap, infrastructure is validated with `selectel-smoke`, then any external defect is corrected through the normal diff-aware QA flow and rerun only on the affected external gate. A new local full-gate run is required only for a later task or when the operator explicitly requests local diagnosis.

Workflow dispatch accepts an operator note for exceptional runs. A non-latest release-provenance publication requires one. Notes do not weaken any cryptographic admission; they provide an auditable reason beside the immutable proof identity.
