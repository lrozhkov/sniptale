# GitHub OSS release

This runbook publishes a Sniptale extension archive from `https://github.com/lrozhkov/sniptale` within the [redistribution scope](provenance.md#scope).

## Preconditions

- Use the repository-declared toolchain and a clean `npm ci` installation.
- Use a clean `main` checkout whose commit exists in the canonical GitHub repository.
- Confirm that `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `THIRD_PARTY_DEPENDENCIES.json`, and `LICENSES/**` match `tooling/configs/qa/oss-release.data.json`.
- Confirm that GitHub release immutability is enabled.

The [generated project facts](../engineering/project-facts.md) own current GitHub checks, tag rules, and release settings.

## Legal material

Run `npm run release:legal` when the production dependency closure, reviewed license selection, pinned upstream source, bundled-asset mapping, or authored notice changes. Do not edit generated legal output.

For a pinned upstream refresh, acquire a version-tagged or commit-addressed resource. Verify its package identity. Verify its bytes. Update the checked-in source and its policy fields. Then regenerate the legal output. Ordinary validation must not fetch legal text.

See [OSS provenance](provenance.md) for the evidence policy.

## Candidate proof

Run these commands in order:

```bash
npm run qa:release-harness
npm run qa:checkpoint
npm run qa:closeout -- -m "chore(release): prepare release"
npm run ci:proof
npm run ci:release
```

`ci:release` requires the admitted candidate proof. It runs release-only history, supply-chain, and CodeQL controls. It builds in release mode, validates the artifact and legal closure, and writes the deterministic archive under `build/`. A failed command blocks publication.

The extension archive is not a stand-alone source distribution. Publish Corresponding Source for the exact artifact under `AGPL-3.0-or-later` on the same distribution surface. Include the repository tree, lockfile, build and QA tooling, legal notices, and producing commit identity.

## Publication

Follow the hosted release procedure in the [operator handbook](../tooling/operator-handbook.md). Publication requires the admitted `main` artifact and a matching GitHub-verifiable annotated version tag. Deployment must not rebuild or create a VM.

Publish GitHub's source archive for the same tag beside the extension archive.

## Inspection and correction

Load `dist/` for local browser smoke. Inspect the archive under `build/` and confirm that it contains every policy-owned legal file.

Before publication, revert the complete candidate to roll it back. After publication, preserve history and use a forward corrective commit.

Security reporting is independent of release packaging. Current repository policy is projected in the [generated project facts](../engineering/project-facts.md); reporting instructions belong to [SECURITY.md](../../.github/SECURITY.md).
