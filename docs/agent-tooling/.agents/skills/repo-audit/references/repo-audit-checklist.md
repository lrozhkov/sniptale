# Repo Audit Checklist

## Architecture And Security

- Runtime boundaries, package/app-core direction, thin entrypoints, role-based owner naming, public-contract parsing, transitive consumers, parser flow, state authority, UI/i18n/design ownership, and failure behavior match active architecture.
- Privileged browser APIs, IPC authorization, AI/network flows, imports/exports, logs, storage, sanitization, manifest permissions, and web-accessible resources match their policy owners.
- Secrets and sensitive page data do not move through generic helpers or persist outside approved owners.

## Tooling And Workflow

- `AGENTS.md`, active docs, package scripts, wrappers, QA policy, and active skills teach the same workflow and product/harness split.
- Diff-scoped structural enforcement, the executable advisory catalog, visible sanitized output, advisory state, canonical catalog, derived control inventory, control dispositions, and manual report-only structural/topology-audit labeling remain synchronized. The topology section remains a complement to structural pressure, not a separate advisory family or a blocking guard.
- No enforcement, advisory, preflight, repository evidence, dependency, or skill path reintroduces model-token limits or token-hotspot inventories. Do not run a repository-wide structural detector to establish this; inspect policy and supplied artifacts.
- Required review follows green proof, remains independent/read-only, and receives no inherited context.
- Baselines, allowlists, dispositions, and policy registries are narrow, justified, consumed, and validated.
- Manual, report-only, external, optional, or skip-capable tools state their risk and do not masquerade as normal closeout gates. `qa:structural-audit` remains operator-invoked architecture maintenance outside PR, agent, and closeout flows; its artifact reports owner/change-reason clusters as `Split`, `Consolidate`, or `Keep` without turning file count into a goal.
- The manual topology artifact distinguishes disjoint path-owner partitions from overlapping forwarding-edge candidates, exposes both counts, retains a complete compact edge inventory beside sampled rich evidence, and classifies every forwarding-only single-production-consumer edge as `Consolidate` or explicit public-contract/runtime/cross-owner/unresolved `Keep`. A zero consolidation count is not accepted when unclassified strong edges remain.
- Obsolete wrappers, scripts, migration scaffolds, path literals, and agent helpers are removed or retained only as explicit negative guards/history.

## Documentation

- Active documentation is current, canonical, naturally paragraphed, and owned by a clear purpose.
- Use VCS history for historical evidence. Do not retain an active documentation archive.
- Workflow, implementation, quality policy, wrapper semantics, command lookup, and setup/recovery are not duplicated across owners.
- Report-like or temporary documents do not remain active authority.

## QA Loopholes

For each loophole, record the concrete supported or hostile path that can bypass it; whether it is changed-scope-only, full-only, advisory-only, manual-only, skip-capable, or undocumented; the material risk; and the narrowest proposed hard-fail, advisory, policy, wrapper, or documentation correction. Omit a theoretical bypass outside the current threat model or supported workflow unless the user explicitly requested speculative-hardening research.

Every finding needs an evidence path, reachable trigger, affected owner, impact, correction, and disposition as immediate or backlog work. Repository-wide controls require repeated observed defects or another low-noise generalizable signature; a one-off or hypothetical scenario does not justify them. Do not report generic concerns.
