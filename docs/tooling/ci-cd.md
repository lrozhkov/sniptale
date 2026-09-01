# Canonical CI/CD

This document owns external execution, trust boundaries, proof transport, infrastructure cleanup, and release admission. Command scope belongs in [wrapper summary](wrapper-summary.md), operator commands in [operator handbook](operator-handbook.md), and changing values in generated [project facts](../engineering/project-facts.md).

## Machine authority

Public workflow graphs live in [`pr.yml`](../../.github/workflows/pr.yml), [`provenance.yml`](../../.github/workflows/provenance.yml), [`provenance-finalize.yml`](../../.github/workflows/provenance-finalize.yml), [`selectel-smoke.yml`](../../.github/workflows/selectel-smoke.yml), [`selectel-maintenance.yml`](../../.github/workflows/selectel-maintenance.yml), and [`release.yml`](../../.github/workflows/release.yml). PR, provenance, and infrastructure smoke call the trusted reusable [`_canonical-proof.yml`](../../.github/workflows/_canonical-proof.yml); finalization, maintenance, and deployment cannot execute candidate QA. Tool versions, execution minima, proof semantics, gate inputs, GitHub policy, and Selectel policy come from the machine-readable files under [`tooling/configs/ci`](../../tooling/configs/ci). Reuse closures come from the owner files under [`tooling/configs/qa`](../../tooling/configs/qa). This document does not duplicate their values or inventories.

`npm run ci:dependencies:plan` performs a read-only upstream freshness check over every npm lock root, external Action SHA and selected-Action allowlist entry, container base, Debian snapshot, Playwright/browser asset, CodeQL, OSV Scanner, Gitleaks, actionlint, Python requirement lock and disposable GitHub runner archive. Each registered identity is reported as current, update available, upstream unverifiable, or check failed. The command never mutates the repository or an upstream service and never creates a branch, commit, issue, or pull request. The operator reviews compatibility before changing canonical locks and projections through normal QA and review.

## Continuous Integration

Purpose-specific public workflows expose the shared proof graph without mixing maintenance and deployment triggers:

- Fast PR Gate runs `ci:proof`: repository-wide deterministic controls, read-only formatting, Oxlint, full product coverage and tests, the affected harness closure (or complete partitioned harness for CI/tooling/shared-control changes), the Fast audit profile, and one fresh `npm run build:release` without ZIP or reusable build proof. Product proof and harness proof use separate resource waves. Scheduled gates force the complete harness. It does not claim release readiness.
- Release provenance Gate seals an exact Fast proof on the disposable external runner, admits that proof under trusted-base policy, and only then runs `ci:release`. Release inherits deterministic/test/coverage/build evidence and executes the release-time audit plus Build/Release archive. Missing, stale, cross-tree, cross-control, or cross-environment proof fails before release composition; there is no fallback.

Repository audit evidence, topology inventory, and mutation results run after canonical proof sealing in an isolated, non-blocking CI job and are uploaded only as optional advisory artifacts. Their failures are visible as advisory failures and do not satisfy or block the canonical quality-control graph.
- Selectel connectivity performs read-only controller admission.
- Selectel infrastructure smoke provisions one disposable runner, verifies the machine-owned host-command closure and locked image runtime, skips QA, and proves cleanup.
- Selectel recovery deletes resources for one exact historical run and attempt without building a QA image or provisioning a runner. It is owned by the separate maintenance workflow together with the daily sweep and read-only dependency inventory.

Ready pull requests use the Fast gate. Merging a green PR does not run the same gate again for the squash commit; `main` receives canonical external proof only through manual or scheduled Release provenance. Fast execution reads `SELECTEL_QA_PROFILES`; provenance reads identically shaped `SELECTEL_RELEASE_PROFILES`. Both variables have one authority in the `selectel-runner-controller` environment; repository-scoped resource tables and lane minima are forbidden. The controller validates the document shape and safe lifecycle, then checks the requested zone, flavor, volume type and capacity against live Selectel APIs.

## Candidate admission

Pull requests execute candidate QA controls once. The trusted-base envelope owns candidate identity, mandatory phases, proof schema, evidence hashes, allowed reuse, execution compatibility, artifact closure, and final job-graph interpretation. Candidate execution receives no GitHub token, Selectel credentials, OIDC authority, or write access to the trusted workspace.

Control drift is reported as `candidate-controls` with both digests and does not cause a second QA run. The envelope does not re-execute the previous implementation; QA changes therefore require normal human review and become trusted only after merge to `main`. Reuse and docs-only derivation are forbidden across different control digests.

The trusted classifier derives docs-only proof only when every changed path is registered as non-gate input and all semantic and control digests match an exact successful base proof. Unknown paths fail closed to VM execution. The final gate accepts exactly one graph: derived proof with no VM jobs, or admitted VM proof plus a successful cleanup receipt.

## Proof and reuse

Local WSL and GitHub/Selectel invoke the same JS owners and produce compatible receipts. WSL is diagnostic because host libraries, browser assets, filesystem behavior, timing, and resource limits may differ; release provenance requires the locked external environment.

`npm run ci:proof:container` reproduces the canonical Linux/amd64 Fast proof against the current local workspace. `npm run ci:release:container` discovers that exact sealed local-workspace proof and then accepts it only when the container independently confirms the unchanged tree, controls, and locked image identity; run the container proof first. The external release workflow performs those two phases atomically on the same disposable runner. Ordinary `ci:proof` and `ci:release` use the same admission shape with one lane-independent host-WSL environment identity derived from the complete locked toolchain inputs and remain the faster diagnostic path.

The runtime-parity owner validates `node`, `npm`, and `npx` together against the machine lock, including their PATH resolution, real executable paths, process runtime and shared npm package root. Every hosted job uses the repository-owned setup action to select the locked Node projection, install the exact locked npm/npx package, and run this proof before its first repository Node entrypoint. Infrastructure smoke applies the same owner to both the disposable Selectel host and the immutable QA image, compares their sanitized semantic path relationships, and blocks before product QA when one command or symlink drifts. External receipts do not retain absolute host paths.

The trusted container phase graph begins with that blocking runtime-parity proof before dependency installation, locked toolchain verification, workflow admission, provisioning, and runner execution. Native WSL gates perform the same host parity check during local-toolchain admission before product controls.

The QA image uses the digest-pinned Node base CA bundle to reach the HTTPS Debian snapshot with APT peer and repository signature verification continuously enabled. Repository policy rejects TLS peer disablement, unauthenticated packages, `trusted=yes`, insecure-repository admission and a missing CA-bundle proof.

Reuse is content-addressed and owner-controlled. Unit, build/archive, CodeQL, and coverage receipts bind their complete machine-registered inputs, control digest, environment identity, and output hashes. Resource allocation is execution metadata and never changes semantic scope, but policy decides whether an execution profile is eligible as a canonical reuse source. `ci:build` cannot mint provenance or a reusable archive receipt.

Fast proof never contains the Build/ZIP receipt or archive; those artifacts are release-only. It does contain the canonical unit and coverage receipts/reports plus the Fast security and license evidence required for admission. Release seals its admission receipt, the source proof manifest, and the source observability identity, verifies inherited hashes, and runs only the explicitly release-owned audit controls. Duplicate product Vitest or coverage execution is rejected by the composition contract.

Candidate QA and controller images use a content-addressed identity over the candidate Git tree and commit, Dockerfile and every copied build-context input, digest-pinned base image, build arguments, BuildKit frontend, provenance/SBOM settings, and target platform. A lookup reuses only an immutable GHCR digest whose single-platform manifest, labels, provenance subject, and base-image material match that identity. A failed QA run therefore keeps the exact image available for another attempt, while a changed commit, tree, or build input derives a different image. Verified use receipts refresh a seven-day idle TTL; maintenance removes images that remain unused beyond it. Manual runs may request a separately tagged forced rebuild with a recorded reason without weakening normal cache admission.

Every real run performs `npm ci` against the candidate lock. PRs may restore download cache but cannot update shared cache; trusted `main` and provenance runs may update it. Cache state never satisfies a control.

## Selectel lifecycle

Provisioning writes an early identity-bound receipt. Each attempt owns a disposable runner registration, security group, network, subnet, router interface, router, VM port, VM, and boot volume. The project identifier is emitted only as a shortened SHA-256; credentials, raw project ID, JIT configuration, cloud-init, and registry tokens are excluded from artifacts.

Nova server creation uses one POST over a fresh verified connection. If its response is lost, the controller retries only exact-owned read reconciliation; it never repeats the POST or falls through to another resource profile.

Cleanup runs with `always()` independently of QA proof and deletes the complete attempt-owned resource set. It accepts the incrementally written `provisioning` receipt, so cancellation at any acquisition step remains recoverable. If the early receipt is unavailable, recovery is restricted to the exact run and attempt identity. The recovery-only mode and daily TTL sweeper build the controller from their checked-out trusted commit; neither depends on a moving image tag. They are recovery paths, not normal cleanup, and a successful cleanup does not trigger another sweep.

## Artifacts and presentation

Canonical artifacts are attempt-qualified and sealed with a manifest and checksums. Normal failures still upload sanitized run records and logs; timeout handling preserves the latest atomically written observability state when the runner remains responsive. Retention, allowlists, report scope, release assets, and immutable image publication are machine policy.

SARIF and Coveralls are presentation layers over admitted proof. Upload failure does not change the blocking gate result, but the presentation job reports the failed upload rather than turning it into a false successful publication. Every successful `main` provenance run sends its already admitted LCOV to Coveralls exactly once; deployment never computes or publishes coverage. README badges distinguish release provenance, deployment, and release-provenance coverage; badge SVG files are not release assets.

## Continuous Deployment

Release provenance has two authorities. The canonical workflow runs product QA once and seals an immutable proof for its source SHA. The short finalizer accepts that run ID, requires both canonical release gates to be green, and classifies every intervening path as either `canonical-proof-invalidating` or `post-proof-only`. Unknown paths, product/build inputs, QA controls, Docker closure, or proof composition changes fail closed and require a new canonical run. A post-proof-only change may rerun finalization without Selectel or product QA; the finalizer verifies the source proof under its original control commit, binds the exact cached image receipts, publishes only digest-preserving image aliases, creates GitHub attestations, and uploads one release-bound finalizer artifact.

Continuous Deployment is manual, restricted to `main`, and never provisions Selectel or reruns QA. It accepts a signed annotated version tag and an exact successful provenance finalizer run bound to the tagged commit. Admission verifies tag identity, version, ancestry, signature, source proof hashes, post-proof classification, finalizer control identity, publisher policy, release state, release notes, prepared asset composition, and GitHub attestations for every exact prepared release subject. The finalizer also attests the admitted immutable QA and controller digests; BuildKit provenance and the custom Sniptale proof remain mandatory independent authorities.

Diagnostic deployment may run from a temporary branch against the exact successful branch provenance diagnostic. That mode verifies the proof, prepares and verifies the complete release asset and notes composition, classifies live release state, preserves the deployment artifact, and reports through its own gate without rerunning canonical QA. The remote signed-tag and GitHub-attestation checks are explicitly deferred because those authorities do not exist until the candidate reaches `main`. A second diagnostic on `main` uses the signed tag and successful main provenance closure to exercise those final read-only authorities. Neither diagnostic has the `release-publisher` environment, contents write permission, or a release create, asset upload, publish, or cleanup path. Publication remains restricted to `main` and alone consumes the admitted artifact behind the protected environment, creates an owned draft, verifies uploaded assets, and publishes an immutable alpha release marked as the repository's latest release. The operator supplies product-facing Markdown as a deployment input; the workflow adds the stable introduction, install instructions, and alpha warning instead of hard-coding version-specific highlights or storing a release-notes file in the repository. A retry may accept the exact immutable result or recreate only its own matching mutable draft; it rejects unrelated or mismatched release state.

## Bypass and recovery

The local PR bypass requires a clean exact candidate, container proof, and an operator reason. It posts the proof identity but never merges. It is an incident mechanism, not the normal route for QA evolution.

For a no-run bootstrap, open a draft PR, apply the trusted `ci-local-proof-bypass` label, then mark it ready and verify that the PR graph has no executing jobs before merge. The workflow has no `push main` trigger, so the merge cannot reserve another runner or provision Selectel.
