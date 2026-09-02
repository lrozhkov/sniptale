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
- Give each rule or fact one owner. Other documents link to that owner without restating the rule or fact.
- State each requirement once. Do not repeat it as both a summary and a detailed procedure or checklist.
- Use one imperative per sentence. State the action, trigger, and exception explicitly.
- Define local terms before using them. Replace qualitative triggers with an exact path, state, threshold, command, or machine classification.
- Make categories mutually exclusive. When overlap is possible, define the matching order.
- Keep independent properties separate. Do not infer risk, completion, review, or proof status from another property.
- Use machine output as the authority for generated classifications and inventories. Do not maintain a prose copy of the mapping.
- Keep only text that changes an action or records a decision.
- Use a table only for repeated field comparison or mapping.
- Examples clarify a rule but do not extend it.
- When a rule changes, update its index, machine policy, guard, and consumers in the same change.

## Architecture and product

- [Repository overview](architecture/repository-overview.md) is the canonical source map.
- [Code organization](architecture/code-organization.md) owns folder, dependency, naming, and split rules.
- [Runtime contexts](architecture/runtime-contexts.md) owns runtime entrypoints and coordination boundaries.
- [Shared topology](architecture/shared-topology.md) explains package and app-core residency.
- [Storage state authority](architecture/storage-state-authority.md) owns persistence invariants.
- [Persistence contracts](architecture/persistence-contracts.md) owns IndexedDB admission, domain versions, migration, and recovery policy.
- [Parser architecture](architecture/parser-architecture.md), [i18n architecture](architecture/i18n-architecture.md), [platform tradeoffs](architecture/platform-patterns-and-tradeoffs.md), [video editor layering](architecture/video-editor-layering.md), and [EffectV1 bundles](architecture/video-effect-bundles.md) own their domain contracts.
- [DESIGN.md](agent-tooling/DESIGN.md) owns UX, accessibility, theme, and interaction requirements.

## Implementation, operation, and release

- [Implementation rules](engineering/implementation-rules.md) owns engineering decision guidance.
- [Technical debt](engineering/tech-debt-report.md) is the generated human view of the machine debt registry.
- [Project facts](engineering/project-facts.md) is the generated projection of changeable product, browser, permission, persistence, runtime, security-reporting, and release-policy values.
- [Canonical CI/CD](tooling/ci-cd.md) owns external execution and release admission; [operator handbook](tooling/operator-handbook.md) routes commands; [wrapper summary](tooling/wrapper-summary.md) explains wrapper behavior; [code quality](tooling/code-quality.md) owns gate and exception policy; [Web Snapshot Smoke](tooling/web-snapshot-smoke.md) owns local snapshot fidelity verification.
- [WSL setup](tooling/wsl-setup.md) owns environment setup, and [repository root inventory](tooling/repo-root-inventory.md) owns required root entries.
- [Optional agent tooling](agent-tooling/README.md) owns opt-in installation and removal for local agent instructions and skills.
- [Data handling](security/data-handling.md), [manifest permissions](security/manifest-permissions.md), and [threat model](security/threat-model.md) own security policy.
- [Provenance](oss/provenance.md) and [release](oss/release.md) own redistribution evidence and local release procedure.
- [CONTRIBUTING.md](../CONTRIBUTING.md) owns issue and proposal guidance and records the current external code-contribution policy; [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) governs participation.
