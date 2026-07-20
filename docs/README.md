# Sniptale documentation

Active documentation is organized by ownership. This tree contains current authority only; research notes, migration records, and deprecated-document archives are not retained here.

## Documentation policy

### Deterministically enforced

- This file is the sole documentation index. The docs-topology check classifies every tracked Markdown file and verifies index coverage.
- Keep only current documentation. The same check rejects research, migration, and deprecated-document trees under `docs/`.
- Write Markdown and legal prose as natural paragraphs without hard wrapping. The docs-topology check rejects hard-wrapped prose and formatter admission.
- Pair engineering rules with their deterministic check. Put rules without automated proof in a clearly identified judgment-only section.

### Review-only guidance

- Code, machine-readable policy, and deterministic checks are the primary authority. Authored documentation records only context, decisions, operating procedures, audit evidence, or judgment that the implementation cannot express directly.
- Give each rule or fact one document owner and link to it instead of duplicating it.
- Keep prose concise and factual. Omit generic purpose sections, literary comparisons, repeated implementation detail, and large tables.
- Update affected documentation, indexes, policies, guards, and consumers in the same coherent change.

## Architecture and product

- [Repository overview](architecture/repository-overview.md) is the canonical source map.
- [Code organization](architecture/code-organization.md) owns folder, dependency, naming, and split rules.
- [Runtime contexts](architecture/runtime-contexts.md) owns runtime entrypoints and coordination boundaries.
- [Shared topology](architecture/shared-topology.md) explains package and app-core residency.
- [Storage state authority](architecture/storage-state-authority.md) owns persistence invariants.
- [Parser architecture](architecture/parser-architecture.md), [i18n architecture](architecture/i18n-architecture.md), [platform tradeoffs](architecture/platform-patterns-and-tradeoffs.md), [video editor layering](architecture/video-editor-layering.md), and [EffectV1 bundles](architecture/video-effect-bundles.md) own their domain contracts.
- [DESIGN.md](../DESIGN.md) owns UX, accessibility, theme, and interaction requirements.

## Implementation, operation, and release

- [Implementation rules](engineering/implementation-rules.md) owns engineering decision guidance.
- [Technical debt](engineering/tech-debt-report.md) is the generated human view of the machine debt registry.
- [Operator handbook](tooling/operator-handbook.md) routes commands; [wrapper summary](tooling/wrapper-summary.md) explains wrapper behavior; [code quality](tooling/code-quality.md) owns gate and exception policy.
- [WSL setup](tooling/wsl-setup.md) owns environment setup, and [repository root inventory](tooling/repo-root-inventory.md) owns required root entries.
- [Data handling](security/data-handling.md), [manifest permissions](security/manifest-permissions.md), and [threat model](security/threat-model.md) own security policy.
- [Provenance](oss/provenance.md) and [release](oss/release.md) own redistribution evidence and local release procedure.
- [CONTRIBUTING.md](../CONTRIBUTING.md) owns issue and proposal guidance and records the current external code-contribution policy; [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) governs participation.
