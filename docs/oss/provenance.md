# OSS provenance

This record describes the Sniptale release source and redistribution evidence published through `https://github.com/lrozhkov/sniptale`. Hosted security reporting remains outside this policy.

## Project-authored material

`NOTICE` is the committed project attribution owner: Sniptale, Copyright (C) 2026 Lev Rozhkov, licensed as `AGPL-3.0-or-later`. The same author/license identity is declared by the root and workspace package metadata. `LICENSE` contains the byte-pinned standard GNU AGPL v3 text; the “or later” election is stated in `NOTICE`, README, and package metadata.

Local Git authorship corroborates repository history but does not replace the committed attribution and package declarations. Product-critical non-font assets are treated as project-authored material unless a checked-in third-party provenance entry states otherwise.

## Bundled Manrope font

The extension bundles three Manrope 5.2.8 WOFF2 files from `@fontsource-variable/manrope`. Each policy entry maps the bundled path to an exact installed package source path and SHA-256; validation rejects missing, additional, changed, or source-divergent bytes. `LICENSES/OFL-1.1.txt` is the single canonical redistributed copy of the installed package `LICENSE`. The dependency manifest references that file instead of generating a duplicate. The fonts remain under OFL-1.1; Sniptale code remains under AGPL-3.0-or-later.

## Dependency legal closure

`THIRD_PARTY_DEPENDENCIES.json`, `THIRD_PARTY_NOTICES.md`, and `LICENSES/dependencies/**` are generated from the exact production redistribution closure. The current closure contains 35 packages: ordinary installed license files, one README-extracted license section, and one version-tagged, byte-pinned upstream source for a package whose tarball omits its license text.

`@iconify-icons/tabler@1.2.95` embeds Tabler Icons 2.40.0 metadata but ships no license file. Its MIT text is read offline from `tooling/release/dependency-legal/sources/tabler-icons-2.40.0.LICENSE`, byte-identical to `https://raw.githubusercontent.com/tabler/tabler-icons/v2.40.0/LICENSE`, SHA-256 `896d3e36cb41d19f279ce9ffb085a9f0d96e58db59c18f042242ff6c7e78d50f`. Policy pins the wrapper tarball URL/integrity, icon-set version, author identity/URL, SPDX license, package-declared license metadata URL, version-tagged origin, local source path, and digest. The package's mutable `master` URL is checked only as installed metadata identity; mutable or catalog URLs are never license evidence. An upstream tag can be retargeted, so the checked-in bytes and digest are the release authority.

The production redistribution closure is not the whole-lock audit inventory. `npm run qa:audit` evaluates the full package-lock CycloneDX SBOM and writes ignored local evidence under `.tmp/licenses/`; the generated release notices cover only dependencies reachable from production roots and actually admitted to the extension artifact.

## Repository and publication scope

The optional native companion is a separate repository and outside this source tree and artifact. The release policy records the current bounded legal, package, font, documentation, and consumer contract through explicit paths, identities, and digests; historical migration trees are not active authority. The canonical repository publishes source and deterministic archives through GitHub Releases with repository-enforced immutability under `vX.Y.Z` tags. A root `SECURITY.md`, hosted security-reporting channel, browser-store submission, and native-companion publication remain outside this release surface.
