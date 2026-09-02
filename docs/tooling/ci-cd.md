# Canonical CI/CD

This document owns external execution, candidate admission, proof transport, Selectel cleanup, and release admission. Operator procedures belong in [operator-handbook.md](operator-handbook.md). Wrapper behavior belongs in [wrapper-summary.md](wrapper-summary.md).

## Authorities

Workflow graphs live in [`.github/workflows`](../../.github/workflows). Machine policy lives under [`tooling/configs/ci`](../../tooling/configs/ci), and QA reuse inputs live under [`tooling/configs/qa`](../../tooling/configs/qa). Generated [project facts](../engineering/project-facts.md) owns changing values. Do not copy those inventories or values into authored documentation.

Dependency freshness covers every identity registered by machine policy. The check is read-only.

## Proof graph

Ready pull requests run the Fast PR Gate through the trusted reusable canonical-proof workflow.

Release provenance admits an exact Fast proof before release execution. [Wrapper summary](wrapper-summary.md#freshness-and-reuse) owns proof composition and reuse behavior.

Repository-audit, topology, and mutation evidence run after proof sealing in a separate non-blocking job. These artifacts neither satisfy nor block the canonical gate.

Selectel connectivity checks controller admission without provisioning. Infrastructure smoke provisions one disposable runner and must prove cleanup. Selectel maintenance performs recovery and scheduled cleanup without entering the QA graph.

Continuous Deployment accepts an admitted provenance finalizer result. It does not provision Selectel or rerun QA.

## Candidate admission

Candidate code receives no GitHub token, Selectel credential, OIDC authority, or write access to the trusted checkout. Trusted-base code validates candidate identity, mandatory phases, receipt schemas and hashes, execution compatibility, artifact closure, and the final job graph.

A control-digest change is reported as `candidate-controls`; it does not cause the previous implementation to run. Changed QA becomes trusted after merge to `main`.

Docs-only proof reuse requires an exact successful base proof, equal semantic and control digests, and changed paths classified by machine policy as non-gate inputs. Unknown paths require candidate execution.

## Proof identity and reuse

External proof runs `npm ci` against the candidate lock. Download caches never replace installation or a control result.

Proof and reuse receipts bind the inputs registered by their machine owner, the control digest, environment identity, and output hashes. Resource allocation is execution metadata. Cross-control-digest reuse is forbidden.

Local WSL proof is diagnostic. External release proof requires the locked runner environment. Container proof reproduces that environment locally; container release requires an unchanged sealed container proof.

Fast proof owns unit and coverage receipts but not archive proof. Release accepts those receipts through exact admission and creates the archive receipt. `ci:build` cannot create reusable or provenance evidence.

## Selectel lifecycle

Each provisioning attempt owns its runner registration, network resources, VM, and boot volume. Provisioning writes an identity-bound receipt before resource acquisition proceeds.

Server creation is attempted once. After an uncertain response, the controller may reconcile only resources with the exact attempt identity.

Cleanup runs independently of QA success and deletes the attempt-owned resources. Recovery targets one run and attempt. The daily TTL sweep is a fallback, not normal cleanup.

Artifacts and logs exclude credentials, raw project identifiers, JIT configuration, cloud-init, and registry tokens. Retention and artifact allowlists are machine policy.

## Release admission

The provenance finalizer accepts only paths classified as `post-proof-only` after the source proof. Unknown paths and changes to product, build, QA, container, or proof composition require a new provenance run.

Publication is restricted to `main`. It requires a GitHub-verifiable annotated version tag, the matching finalizer result, verified release assets, and attestations for every published subject. Diagnostic mode is read-only and cannot enter the publisher environment.

The local PR bypass requires a clean exact candidate, container proof, and an operator reason. It posts evidence and never merges. Use it only for an external-capacity failure or incident.
