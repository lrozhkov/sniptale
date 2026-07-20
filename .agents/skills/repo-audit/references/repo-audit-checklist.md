# Repo Audit Checklist

## Architecture And Security

- Runtime boundaries, package/app-core direction, thin entrypoints, role-based owner naming, public-contract parsing, transitive consumers, parser flow, state authority, UI/i18n/design ownership, and failure behavior match active architecture.
- Privileged browser APIs, IPC authorization, AI/network flows, imports/exports, logs, storage, sanitization, manifest permissions, and web-accessible resources match their policy owners.
- Secrets and sensitive page data do not move through generic helpers or persist outside approved owners.

## Tooling And Workflow

- `AGENTS.md`, active docs, package scripts, wrappers, QA policy, and active skills teach the same workflow and product/harness split.
- Required review follows green proof, remains independent/read-only, and receives no inherited context.
- Baselines, allowlists, dispositions, and policy registries are narrow, justified, consumed, and validated.
- Manual, report-only, external, optional, or skip-capable tools state their risk and do not masquerade as normal closeout gates.
- Obsolete wrappers, scripts, migration scaffolds, path literals, and agent helpers are removed or retained only as explicit negative guards/history.

## Documentation

- Active documentation is current, canonical, naturally paragraphed, and owned by a clear purpose.
- Historical material stays archive-only and outside the normal reading path.
- Workflow, implementation, quality policy, wrapper semantics, command lookup, and setup/recovery are not duplicated across owners.
- Report-like or temporary documents do not remain active authority.

## QA Loopholes

For each loophole, record how it can be bypassed; whether it is changed-scope-only, full-only, advisory-only, manual-only, skip-capable, or undocumented; the risk; and the proposed hard-fail, advisory, policy, wrapper, or documentation correction.

Every finding needs an evidence path, affected owner, impact, correction, and disposition as immediate or backlog work. Do not report generic concerns.
