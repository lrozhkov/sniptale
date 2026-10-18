# Canonical CI/CD

This document owns external execution, candidate admission, proof transport, Selectel cleanup, and release admission. Operator procedures belong in [operator-handbook.md](operator-handbook.md). Wrapper behavior belongs in [wrapper-summary.md](wrapper-summary.md).

## Authorities

Workflow graphs live in [`.github/workflows`](../../.github/workflows). Machine policy lives under [`tooling/configs/ci`](../../tooling/configs/ci), and QA reuse inputs live under [`tooling/configs/qa`](../../tooling/configs/qa). Generated [project facts](../engineering/project-facts.md) owns changing values. Do not copy those inventories or values into authored documentation.

Dependency freshness covers every identity registered by machine policy. The check runs in read-only mode.

The canonical npm installation uses the dedicated lock under `tooling/configs/ci/npm`. Upstream npm tarballs restore bundled dependencies during `npm ci`. The installation completes only after `tooling/ci/npm-runtime.mjs` normalizes the two reviewed dependencies to their locked replacements and checks resolution from npm and their actual consumers. Local and container provisioning run this step with lifecycle scripts disabled. Local cache reuse checks the bound lock, replacement versions, and runtime resolution before publishing its PATH.

## Proof graph

Ready pull requests run the Pull request checks through the trusted reusable Checks workflow.

Release provenance admits an exact Fast proof before release execution. [Wrapper summary](wrapper-summary.md#freshness-and-reuse) owns proof composition and reuse behavior.

Repository-audit, topology, and mutation evidence run after proof sealing in a separate non-blocking job. These artifacts neither satisfy nor block the canonical gate.

Release checks accepts `runner_backend=selectel` or `runner_backend=github`. Existing callers and schedules default to Selectel. Unknown selectors fail before resource acquisition. Both modes execute the same pinned QA image and require full canonical checks plus trusted admission.

GitHub mode uses a standard Ubuntu runner with the bounded profile in the canonical workflow. It skips Selectel provisioning and cleanup and does not enter the controller environment. Selectel mode still requires successful provisioning and exact-attempt cleanup. The final gate admits only the complete graph for the selected mode. Candidate credential isolation, proof identity, release signatures, and publication admission remain mandatory.

Selectel connectivity checks controller admission without provisioning. Infrastructure smoke provisions one disposable runner and must prove cleanup. Selectel maintenance performs recovery and scheduled cleanup without entering the QA graph.

Publish release accepts an admitted provenance finalizer result. It does not provision Selectel or rerun QA.

Product installation also explicitly normalizes the pinned Mediabunny 1.61.3 artifacts through `tooling/ci/mediabunny/normalize.mjs` after `npm ci --ignore-scripts`. This named product-dependency step is separate from npm runtime normalization and adds no lifecycle hook. Local bootstrap fingerprints the patch inputs and checks installed bytes on reuse. Build, unit, coverage, CodeQL and typecheck proof inputs bind the same patch artifacts. Direct Vite, Vitest and typecheck execution performs a read-only installed-byte check and fails if setup is missing or differs from the required state.

Run `npm run dependencies:normalize` after a clean root installation. Use `node tooling/ci/mediabunny/normalize.mjs --check` for read-only checking.

Candidate proof/release wrappers perform this explicit setup inside the existing credential-free candidate phase, so an unmerged candidate also works under the previous trusted phase graph. The trusted phase graph and its receipt schema remain unchanged. CI preparation installs normalize their own checkout, including the checked proof-source checkout. This setup excludes isolated npm and mutation toolchains. No runtime code repairs installed packages.

### Modified Mediabunny distribution

`patch-manifest.json` binds registry identity, upstream package metadata, preserved MPL license, source patch, compressed payload, and every original/result file hash. `patch-payload.json.gz` contains a bounded JSON map of complete replacement UTF-8 files. The installer accepts only all-original or all-patched files. It checks every path, package identity and replacement before writing, preserves file modes, then checks completion. Unknown bytes, symlinks, concurrent ownership, and interrupted mixed installations fail closed.

Recovery is a fresh `npm ci --ignore-scripts` followed by normalization. A process killed during writes can leave the package-local normalization lock. Fresh installation removes that stale state.

`source.patch` is the reviewable five-file upstream TypeScript delta. The payload includes those complete modified source files and regenerated distribution entrypoints. Keep upstream MPL headers and this LICENSE. Supply the upstream corresponding source together with the modifications and reconstruction instructions in release source distribution. Upstream registry tarball integrity identifies the starting artifact, not the modified result.

Live audio capture sets `MediaStreamTrackProcessor.maxBufferSize` to 128 frames. This bounded buffer retains samples during short document stalls. A separate queue holds at most 128 admitted samples while the encoder or writer waits. Queue overflow rejects `errorPromise`. Capture continues to discard paused samples independently of the writer. Resume replaces the native reader on the same track to discard its paused buffer. Timestamp, codec, pause, and finalization contracts remain unchanged.

Reconstruction uses Node 24.21.0, TypeScript 6.0.3 and esbuild 0.28.2. Compile the five modified TS modules as ES2022/ESNext, preserving explicit `.js` relative imports. Emit their declarations/maps through a full TypeScript program using shipped shared declarations for the tarball's omitted shared TS source. Rebuild the package's five browser/Node CJS/ESM bundles from the resulting ESM index. Browser builds retain upstream's Node/fs exclusion.

Add the same inline metadata union to the aggregate declaration. The manifest pins the resulting distribution bytes so install never depends on an available compiler version. The generated `LICENSES/dependencies/mediabunny-1.61.3-modified/README.md` describes exact package reconstruction from the integrity-checked upstream tarball and supplied replacement payload. That release directory contains the manifest, complete modified sources and distributions in the payload, reviewable source patch, and license. Task-local compiler/proof scripts are development evidence.

Reconstructing the exact supplied package does not depend on those scripts.

The optional public audio window admits only AAC fragmented MP4 and Opus WebM, 48 kHz, integer positive frame counts through 26 hours, and EncodedAudioPacketSource. Opus pre-skip comes from the initial decoder configuration, not caller-authored metadata. Without the option, existing output behavior remains unchanged. Consumers own native encoder setup, bounded tail, cancellation, and sequence duration. This patch does not implement that orchestration.


## Candidate admission

Candidate code receives no GitHub token, Selectel credential, OIDC authority, or write access to the trusted checkout. Trusted-base code checks candidate identity, mandatory phases, receipt schemas and hashes, execution compatibility, artifact closure, and the final job graph.

A control-digest change is reported as `candidate-controls`. It does not cause the previous implementation to run. Changed QA becomes trusted after merge to `main`.

Shallow PR checkouts can lack merge-base ancestry. Compare their exact base and candidate trees. Full-history checkouts retain merge-base comparison. Neither mode reduces repository-wide Fast proof or harness selection. Missing or unreadable trees fail proof.

Docs-only proof reuse requires an exact successful base proof, equal semantic and control digests, and changed paths classified by machine policy as non-gate inputs. Unknown paths require candidate execution.

## Proof identity and reuse

External proof runs `npm ci` against the candidate lock. Download caches never replace installation or a control result.

Proof and reuse receipts bind the inputs registered by their machine owner, the control digest, environment identity, and output hashes. Resource allocation is execution metadata. Cross-control-digest reuse is forbidden.

Local WSL proof is diagnostic. External release proof requires the locked runner environment. Container proof reproduces that environment locally. Container release requires an unchanged sealed container proof.

Fast proof owns unit and coverage receipts but not archive proof. Release accepts those receipts through exact admission and creates the archive receipt. `ci:build` cannot create reusable or provenance evidence.

## Selectel lifecycle

Each provisioning attempt owns its runner registration, network resources, VM, and boot volume. Provisioning writes an identity-bound receipt before resource acquisition proceeds.

The controller attempts server creation once. After an uncertain response, the controller may reconcile only resources with the exact attempt identity.

Cleanup runs independently of QA success and removes the attempt-owned resources. Recovery targets one run and attempt. The daily TTL sweep is a fallback, not normal cleanup.

Artifacts and logs exclude credentials, raw project identifiers, JIT configuration, cloud-init, and registry tokens. Retention and artifact allowlists are machine policy.

## Release admission

The provenance finalizer requires a later control commit with at least one path classified as `post-proof-only`. After the source proof succeeds, land that control-only change through the normal pull-request path before dispatching the finalizer. The source proof commit itself is not a valid finalizer control commit. Unknown paths and changes to product, build, QA, container, or proof composition require a new provenance run.

Before `Prepare release`, require a completed source run. Both `Checks / Release result` and `Release result` must succeed. The successful `Tests and build` job alone does not satisfy this requirement. Let additional reports finish before preparation. Diagnose a failed consumer before repeating successful canonical execution.

For a release, complete Release checks on the source commit before creating its signed version tag. Then land the allowed control-only correction. Run Prepare release from that later `main` commit with the successful source run ID. The tag stays on the proven source commit. The finalizer runs on the later control commit. Dispatching Prepare release on the source commit itself fails admission even when its proof is green.

Publication is restricted to `main`. It requires a GitHub-verifiable annotated version tag, the matching finalizer result, checked release assets, and attestations for every published subject. Diagnostic mode remains read-only and cannot enter the publisher environment.

The local PR bypass requires a clean exact candidate, container proof, and an operator reason. It posts evidence and never merges. Use it only for an external-capacity failure or incident.
