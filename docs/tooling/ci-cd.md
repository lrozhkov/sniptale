# Canonical CI/CD

This document owns external execution, trust boundaries, proof transport, infrastructure cleanup, and release admission. Command scope belongs in [wrapper summary](wrapper-summary.md), operator commands in [operator handbook](operator-handbook.md), and changing values in generated [project facts](../engineering/project-facts.md).

## Machine authority

Workflow graphs live in [`quality-gate.yml`](../../.github/workflows/quality-gate.yml) and [`release.yml`](../../.github/workflows/release.yml). Tool versions, execution minima, proof semantics, gate inputs, GitHub policy, and Selectel policy come from the machine-readable files under [`tooling/configs/ci`](../../tooling/configs/ci). Reuse closures come from the owner files under [`tooling/configs/qa`](../../tooling/configs/qa). This document does not duplicate their values or inventories.

## Continuous Integration

The single Continuous Integration workflow has five modes:

- Fast PR Gate runs `ci:proof`, including full Vitest, but excludes release-only SonarJS, coverage, CodeQL, mutation, and release audit controls. It does not prove release readiness.
- Release provenance Gate runs `ci:release`. It consumes an exact Fast proof or completes the Fast prerequisite on the same VM before release-only controls; it does not run a second unit-test owner.
- Selectel connectivity performs read-only controller admission.
- Selectel infrastructure smoke provisions one disposable runner, verifies the machine-owned host-command closure and locked image runtime, skips QA, and proves cleanup.
- Selectel recovery deletes resources for one exact historical run and attempt without building a QA image or provisioning a runner.

Ready pull requests and `main` use the Fast gate. Manual and scheduled provenance use the Release gate. Fast execution reads `SELECTEL_QA_PROFILES`; provenance reads identically shaped `SELECTEL_RELEASE_PROFILES`. Both variables have one authority in the `selectel-runner-controller` environment; repository-scoped resource tables and lane minima are forbidden. The controller validates the document shape and safe lifecycle, then checks the requested zone, flavor, volume type and capacity against live Selectel APIs.

## Candidate admission

Pull requests execute candidate QA controls once. The trusted-base envelope owns candidate identity, mandatory phases, proof schema, evidence hashes, allowed reuse, execution compatibility, artifact closure, and final job-graph interpretation. Candidate execution receives no GitHub token, Selectel credentials, OIDC authority, or write access to the trusted workspace.

Control drift is reported as `candidate-controls` with both digests and does not cause a second QA run. The envelope does not re-execute the previous implementation; QA changes therefore require normal human review and become trusted only after merge to `main`. Reuse and docs-only derivation are forbidden across different control digests.

The trusted classifier derives docs-only proof only when every changed path is registered as non-gate input and all semantic and control digests match an exact successful base proof. Unknown paths fail closed to VM execution. The final gate accepts exactly one graph: derived proof with no VM jobs, or admitted VM proof plus a successful cleanup receipt.

## Proof and reuse

Local WSL and GitHub/Selectel invoke the same JS owners and produce compatible receipts. WSL is diagnostic because host libraries, browser assets, filesystem behavior, timing, and resource limits may differ; release provenance requires the locked external environment.

Reuse is content-addressed and owner-controlled. Unit, build/archive, CodeQL, and coverage receipts bind their complete machine-registered inputs, control digest, environment identity, and output hashes. Resource allocation is execution metadata and never changes semantic scope, but policy decides whether an execution profile is eligible as a canonical reuse source. `ci:build` cannot mint provenance or a reusable archive receipt.

Every real run performs `npm ci` against the candidate lock. PRs may restore download cache but cannot update shared cache; trusted `main` and provenance runs may update it. Cache state never satisfies a control.

## Selectel lifecycle

Provisioning writes an early identity-bound receipt. Each attempt owns a disposable runner registration, security group, network, subnet, router interface, router, VM port, VM, and boot volume. The project identifier is emitted only as a shortened SHA-256; credentials, raw project ID, JIT configuration, cloud-init, and registry tokens are excluded from artifacts.

Nova server creation uses one POST over a fresh verified connection. If its response is lost, the controller retries only exact-owned read reconciliation; it never repeats the POST or falls through to another resource profile.

Cleanup runs with `always()` independently of QA proof and deletes the complete attempt-owned resource set. It accepts the incrementally written `provisioning` receipt, so cancellation at any acquisition step remains recoverable. If the early receipt is unavailable, recovery is restricted to the exact run and attempt identity. The recovery-only mode and hourly TTL sweeper build the controller from their checked-out trusted commit; neither depends on a moving image tag. They are recovery paths, not normal cleanup.

## Artifacts and presentation

Canonical artifacts are attempt-qualified and sealed with a manifest and checksums. Normal failures still upload sanitized run records and logs; timeout handling preserves the latest atomically written observability state when the runner remains responsive. Retention, allowlists, report scope, release assets, and immutable image publication are machine policy.

SARIF and Codecov are presentation layers over admitted proof. Upload failure does not change the blocking gate result.

## Continuous Deployment

Continuous Deployment is manual, restricted to `main`, and never provisions Selectel or reruns QA. It accepts a signed annotated version tag and an exact successful Release provenance run for the same commit. Admission verifies tag identity, version, ancestry, signature, proof hashes, accepted control digest, publisher policy, and release state.

Publication consumes the verified extension archive and canonical evidence, creates an owned draft, verifies uploaded assets, and publishes an immutable alpha release marked as the repository's latest release. Alpha status remains in the release name and notes rather than GitHub's prerelease flag because release-owned README badges resolve through `releases/latest`. A retry may accept the exact immutable result or recreate only its own matching mutable draft; it rejects unrelated or mismatched release state.

## Bypass and recovery

The local PR bypass requires a clean exact candidate, container proof, and an operator reason. It posts the proof identity but never merges. It is an incident mechanism, not the normal route for QA evolution.

For a no-run bootstrap, open a draft PR, apply the trusted `ci-local-proof-bypass` label, then mark it ready. Merge with `[skip ci]` in the resulting `main` commit subject and verify the skipped Actions run before removing the label. This prevents both PR and push events from reserving a runner or provisioning Selectel.
