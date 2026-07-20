# Local OSS release

This runbook prepares and verifies a local Sniptale artifact. It performs no remote creation, push, tag, upload, hosted publication, browser-store submission, or security-reporting setup.

## Inputs

- Node.js 22 and a clean `npm ci` installation.
- Source under `apps/extension` and `packages`, locked by `package-lock.json`.
- Project terms in `LICENSE` and `NOTICE`.
- Bundled and dependency material in `THIRD_PARTY_NOTICES.md`, `THIRD_PARTY_DEPENDENCIES.json`, and `LICENSES/**`.
- Release policy in `tooling/configs/qa/oss-release.data.json`.

## Legal generation

Run `npm run release:legal` only when the dependency closure, reviewed license choice, pinned upstream source, bundled asset mapping, or authored legal notice changes. The command recomputes the production closure offline from the lockfile, installed tree, and checked-in pinned sources; it replaces generated files under `LICENSES/dependencies/**`, reuses policy-declared canonical license files when their bytes match, regenerates the manifest/notices, and updates policy-owned legal digests. Do not hand-edit generated legal outputs.

Pinned upstream refresh is an explicit reviewed acquisition: obtain a version-tagged or commit-addressed resource, verify package/upstream identity and bytes, update the checked-in source plus policy URL/version/digest, then regenerate. The checked-in bytes and digest remain authoritative because tags can be retargeted. Ordinary validation never fetches legal text and rejects missing sources, branch/catalog URLs, metadata/integrity drift, and byte mismatch.

## Canonical proof

When tooling or policy changed, run the harness lane before product and release proof:

```bash
npm run qa:release-harness
npm run qa:checkpoint
npm run qa:release
npm run qa:audit
```

`qa:release` runs product proof, creates a release-mode extension build, validates manifest/security boundaries, and writes a deterministic archive under `build/`. The archive combines extension files with the complete policy-owned legal payload and rejects missing files, extra dependency legal files, digest drift, unsafe paths, or collisions.

The extension zip is not a stand-alone source distribution. Conveyance must make Corresponding Source for the exact artifact available under AGPL-3.0-or-later through the same distribution surface, including the repository tree, lockfile, build/QA tooling, legal notices, and producing commit identity.

`qa:audit` is the whole-repository audit lane. It generates `.tmp/licenses/sbom.cdx.json` and `.tmp/licenses/summary.json`, scans history for credentials, and runs configured static and supply-chain audits. Ignored evidence does not replace Git state or command status.

After required review, use `npm run qa:closeout -- -m "chore(oss): update local release provenance"` for the coherent candidate.

## Inspection and rollback

Load `dist/` for local browser smoke. Inspect the deterministic archive in `build/`; all policy legal files are mandatory. Before distribution, rollback is a revert of the complete candidate. After distribution, preserve history and make a forward corrective commit rather than rewriting published provenance.

The local release surface intentionally excludes a root `SECURITY.md` and hosted reporting instructions. Adding either requires a separately authorized policy change, not a legal-generation side effect.
