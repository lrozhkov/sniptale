# Sniptale documentation

This index lists current active documents and their authority.

## Documentation policy

### Deterministically enforced

- This file is the sole documentation index. The docs-topology check classifies every tracked Markdown file and verifies index coverage for active documents.
- Keep only current documentation. The same check rejects research, migration, and deprecated-document trees under `docs/`.
- Write prose as natural paragraphs. The docs-topology check rejects hard-wrapped prose and formatter admission.
- Classify a rule as deterministic only when its check is named. Treat every other rule as review-only.

### Review-only guidance

- Code, machine-readable policy, and deterministic checks are the primary authority. Use authored documentation for decisions, procedures, context, and review-only judgment.
- Give each rule or fact one document owner. Link to that owner without restating its content.
- Keep only text that changes an action or records a decision.
- Use one imperative per sentence. State its trigger and exception in the same sentence.
- Define each local term with an exact path, state, threshold, command, or machine classification.
- Make categories mutually exclusive or define their matching order.
- Report risk, completion, review, and proof as independent properties.
- Link generated classifications and inventories instead of copying them.
- Use a table only to compare repeated fields.
- Use an example only to clarify an existing rule.
- When changing an enforced rule, update its index entry, machine policy, guard, and consumers together.

## Architecture and product

- [Repository overview](architecture/repository-overview.md) is the canonical source map.
- [Code organization](architecture/code-organization.md) owns source placement, dependencies, and public surfaces.
- [Runtime contexts](architecture/runtime-contexts.md) documents machine-owned runtime entrypoints and owns coordination boundaries.
- [Shared topology](architecture/shared-topology.md) owns package and app-core residency.
- [Storage state authority](architecture/storage-state-authority.md) owns state classes and mutation rules.
- [Persistence contracts](architecture/persistence-contracts.md) owns IndexedDB admission, domain versions, migration, and recovery policy.
- [Parser architecture](architecture/parser-architecture.md), [i18n architecture](architecture/i18n-architecture.md), [platform tradeoffs](architecture/platform-patterns-and-tradeoffs.md), [video editor layering](architecture/video-editor-layering.md), and [EffectV1 bundles](architecture/video-effect-bundles.md) own their domain contracts.
- Repository-local `DESIGN.md` owns UX, accessibility, theme, and interaction requirements.

## Implementation, operation, and release

- [Implementation rules](engineering/implementation-rules.md) owns cross-domain implementation decisions and proof selection.
- [Technical debt](engineering/tech-debt-report.md) is the generated human view of the machine debt registry.
- [Project facts](engineering/project-facts.md) is the generated projection of changeable product, browser, permission, persistence, runtime, security-reporting, and release-policy values.
- [Canonical CI/CD](tooling/ci-cd.md) owns external execution and release admission; [operator handbook](tooling/operator-handbook.md) routes commands; [wrapper summary](tooling/wrapper-summary.md) explains wrapper behavior; [code quality](tooling/code-quality.md) owns gate and exception policy; [Web Snapshot Smoke](tooling/web-snapshot-smoke.md) owns local snapshot fidelity verification.
- [WSL setup](tooling/wsl-setup.md) owns environment setup, and [repository root inventory](tooling/repo-root-inventory.md) owns required root entries.
- `docs/agent-tooling/agent-tooling.zip` is the optional agent-tooling distribution; `npm run agents:pack`, `npm run agents:install`, and `npm run agents:remove` own its lifecycle.
- [Data handling](security/data-handling.md), [manifest permissions](security/manifest-permissions.md), and [threat model](security/threat-model.md) own security policy.
- [Provenance](oss/provenance.md) and [release](oss/release.md) own redistribution evidence and local release procedure.
- [CONTRIBUTING.md](../CONTRIBUTING.md) owns issue and proposal guidance and records the current external code-contribution policy; [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) governs participation.
