# Sniptale documentation

This index lists current active documents and their authority.

## Documentation policy

### Deterministically enforced

- This file is the sole documentation index. The docs-topology check classifies every tracked Markdown file. It checks index coverage for active documents.
- Keep only current documentation. The same check rejects research, migration, and deprecated-document trees under `docs/`.
- Write prose as natural paragraphs. The docs-topology check rejects hard-wrapped prose and formatter admission.
- Classify a rule as deterministic only if the document names its check. Treat every other rule as review-only.

### Review-only guidance

- Code, machine-readable policy, and deterministic checks are the primary authority. Use authored documentation for decisions, procedures, context, and review-only judgment.
- Give each rule or fact one document owner. Link to that owner without repeating its content.
- Keep only text that changes an action or records a decision.
- Use one imperative per sentence. State its trigger and exception in the same sentence.
- Define each local term with an exact path, state, threshold, command, or machine classification.
- Make categories mutually exclusive or define their matching order.
- Report risk, completion, review, and proof as independent properties.
- Link generated classifications and inventories instead of copying them.
- Use a table only to compare repeated fields.
- Use an example only to clarify an existing rule.
- If you change an enforced rule, update its index entry, machine policy, guard, and consumers together.

## Architecture and product

- [Repository overview](architecture/repository-overview.md) is the canonical source map.
- [Code organization](architecture/code-organization.md) owns source placement, dependencies, and public surfaces.
- [Runtime contexts](architecture/runtime-contexts.md) documents runtime entrypoints that machine policy owns. The runtime contexts document owns coordination boundaries.
- [Scenario viewing from Library](architecture/scenario-library-viewing.md) records decisions before implementation about the viewer, content source, and opening flow for guides and tours.
- [Shared topology](architecture/shared-topology.md) owns package and app-core residency.
- [Storage state authority](architecture/storage-state-authority.md) owns state classes and mutation rules.
- [Persistence contracts](architecture/persistence-contracts.md) owns IndexedDB admission, domain versions, migration, and recovery policy.
- [Parser architecture](architecture/parser-architecture.md), [i18n architecture](architecture/i18n-architecture.md), and [platform tradeoffs](architecture/platform-patterns-and-tradeoffs.md) own their domain contracts.
- [Video editor layering](architecture/video-editor-layering.md) and [EffectV1 bundles](architecture/video-effect-bundles.md) own their domain contracts.
- [Design reference](design/index.md) owns product UX, accessibility, theme, control semantics, screen composition, and interaction requirements. Local `DESIGN.md` routes to these documents.

## Implementation, operation, and release

- [Implementation rules](engineering/implementation-rules.md) owns implementation decisions across domains and proof selection.
- [Technical debt](engineering/tech-debt-report.md) is the generated human view of the machine debt registry.
- [Project facts](engineering/project-facts.md) is the generated projection of values that can change. These values concern product, browser, permission, persistence, runtime, security-reporting, and release-policy facts.
- [Canonical CI/CD](tooling/ci-cd.md) owns external execution and release admission.
- [Operator handbook](tooling/operator-handbook.md) routes commands.
- [Wrapper summary](tooling/wrapper-summary.md) explains wrapper behavior.
- [Code quality](tooling/code-quality.md) owns gate and exception policy.
- [Web Snapshot Smoke](tooling/web-snapshot-smoke.md) owns local checks of snapshot fidelity.
- [Optional WebDAV E2E](tooling/webdav-e2e.md) owns the disposable provider lab and links the retained qualification evidence.
- [WSL setup](tooling/wsl-setup.md) owns environment setup. [Repository root inventory](tooling/repo-root-inventory.md) owns required root entries.
- `docs/agent-tooling/agent-tooling.zip` is the optional agent-tooling distribution. `npm run agents:pack`, `npm run agents:install`, and `npm run agents:remove` own its lifecycle.
- [Data handling](security/data-handling.md), [manifest permissions](security/manifest-permissions.md), and [threat model](security/threat-model.md) own security policy.
- [Provenance](oss/provenance.md) and [release](oss/release.md) own redistribution evidence and local release procedure.
- [CONTRIBUTING.md](../CONTRIBUTING.md) owns issue and proposal guidance. It records the current external code-contribution policy. [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) governs participation.

## Product design rules

- [Buttons](design/buttons.md)
- [Choices and surfaces](design/choices-and-surfaces.md)
- [Color and gradient editors](design/color-and-gradient-editors.md)
- [Collections](design/collections.md)
- [Command content](design/command-content.md)
- [Command pressure and activation](design/command-press.md)
- [Compositions](design/compositions.md)
- [Coverage](design/coverage.md)
- [Coverage inspected owners](design/coverage-inspected-owners.md)
- [Field accessories](design/field-accessories.md)
- [Fields](design/fields.md)
- [Font families and installation](design/fonts.md)
- [Foundations](design/foundations.md)
- [Layers](design/layers.md)
- [Localization](design/localization.md)
- [Localization proof](design/localization-proof.md)
- [Navigation](design/navigation.md)
- [Numbers](design/numbers.md)
- [Parameter layout](design/parameter-layout.md)
- [Properties](design/properties.md)
- [Responsive](design/responsive.md)
- [Runtime](design/runtime.md)
- [Selection](design/selection.md)
- [Selection filters](design/selection-filters.md)
- [Specialized](design/specialized.md)
- [Surfaces](design/surfaces.md)
- [Verification](design/verification.md)
