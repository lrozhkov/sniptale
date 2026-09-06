# OSS provenance

This document records redistribution decisions for releases from `https://github.com/lrozhkov/sniptale`. `tooling/configs/qa/oss-release.data.json` owns the exact paths, identities, versions, digests, archive inventory, and release consumers.

## Project material

`NOTICE` owns the Sniptale attribution and `AGPL-3.0-or-later` election. `LICENSE` contains the pinned GNU AGPL v3 text. Package metadata declares the same identity. Git authorship supports history but does not replace these committed declarations.

Treat a product asset as project-authored unless the release policy contains a third-party provenance entry.

## Bundled fonts

The release policy maps every bundled font to an installed package source and SHA-256 digest. Validation rejects missing, additional, changed, or source-divergent bytes.

`LICENSES/OFL-1.1.txt` is the canonical redistributed OFL text. Dependency metadata must reference this file when its bytes match instead of creating a duplicate. Font licensing does not change the Sniptale code license.

## Dependency closure

Generate `THIRD_PARTY_DEPENDENCIES.json`, `THIRD_PARTY_NOTICES.md`, and `LICENSES/dependencies/**` from the production redistribution closure. Do not treat the whole-lock audit inventory as the shipped dependency closure.

Use an installed package license as ordinary evidence. When a package omits usable license text, admit only a checked-in version-tagged or commit-addressed upstream source with an exact digest and reviewed package-to-upstream identity. Treat the checked-in bytes and digest as authority because an upstream tag can be retargeted. Do not use a branch, catalog page, or mutable metadata URL as license evidence.

`npm run ci:release` audits the full lockfile and writes local SBOM and summary evidence under `.tmp/licenses/`. That evidence does not replace the generated redistribution files.

## Scope

The optional native companion is a separate repository and artifact. Browser-store submission and native-companion publication are outside this release surface.

GitHub is the source and release channel. The generated [project facts](../engineering/project-facts.md) project its mutable release settings. Confidential reporting remains owned by [SECURITY.md](../../.github/SECURITY.md).
