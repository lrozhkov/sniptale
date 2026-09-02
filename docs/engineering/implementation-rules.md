# Implementation rules

This document owns implementation decisions that apply across domains. [AGENTS.md](../../AGENTS.md) owns workflow. [Code quality](../tooling/code-quality.md) owns gates and exceptions. [Wrapper summary](../tooling/wrapper-summary.md) owns wrapper behavior.

## Ownership selection

Choose the narrowest existing owner that can enforce the accepted behavior. Use [code organization](../architecture/code-organization.md) for placement and dependencies. Use [shared topology](../architecture/shared-topology.md) for package and app-core residency. Use [runtime contexts](../architecture/runtime-contexts.md) for runtime coordination.

Refactor first only when the accepted change would cross or worsen an ownership boundary. Return to planning when a correction reaches owners, contracts, or persistence writers outside the accepted scope.

Keep production `fabric` value imports under `apps/extension/src/editor/**`. Keep the vendored Fabric adapter under `apps/extension/src/editor/fabric/vendor/**`. Keep `dompurify` in the sanitizer owner. Do not statically import `jszip` from `apps/extension/src/content/**`.

Apply the [public-surface rules](../architecture/code-organization.md#public-surfaces) instead of reintroducing a broad shared facade.

Use a factory with explicit dependencies as the default for a mutable service. Retain a lazy default facade only for an existing compatibility consumer registered by its machine policy. Inject the factory directly for every new consumer. Do not let the facade add a hidden dependency, caller-specific policy, or lifecycle authority.

## Boundary values

Receive JSON, storage, IPC, ZIP, browser, DOM, process, and network values as `unknown`. Parse them at the receiving boundary. Do not use `any`, raw boundary casts, enum casts, string coercion, or suppression directives as validation. Use `as never` only in an exhaustiveness helper.

Use typed contracts for cross-owner messages. Apply background route registration and authorization rules from [runtime contexts](../architecture/runtime-contexts.md#background). Apply secret, diagnostic, retention, and sink rules from [data handling](../security/data-handling.md).

Use `@sniptale/platform/observability/logger` for product logging.

Keep dynamic code and raw HTML sinks closed by default. Do not use `eval`, `Function`, raw `innerHTML`, or unsanitized `dangerouslySetInnerHTML`. Route HTML through the canonical sanitizer owner.

## State, persistence, and async safety

Apply state classifications, mutation rules, and database policy from [storage state authority](../architecture/storage-state-authority.md) and [persistence contracts](../architecture/persistence-contracts.md).

Define rollback or compensation only for a reachable non-atomic sequence that can partially commit. Otherwise propagate a typed failure or apply the owner-documented advisory fail-soft policy.

Protect against stale results only when concurrent results can arrive out of order and change an accepted outcome. Use an owner-issued revision for authoritative ordering. Give a resource-acquiring transaction one owner for commit, cancellation, and cleanup.

## UI, i18n, and design

Apply [DESIGN.md](../agent-tooling/DESIGN.md) to product UI. Apply [i18n architecture](../architecture/i18n-architecture.md) to localized surfaces. Apply [code organization](../architecture/code-organization.md#public-surfaces) to reusable and runtime-specific UI placement.

For mounted, hidden, or portaled UI, prove only the lifecycle states reachable in the changed flow. Use one owner for placement, dismissal, focus, theme inheritance, pointer blocking, and restoration.

## Code shape

Evaluate an owner by responsibility, dependency edges, public surface, effects, state authorities, recovery, control flow, and cohesion. Do not use token or file count as an architecture target.

Analyze topology by owner and change reason. Classify each candidate as `Split`, `Consolidate`, or `Keep`. Minimize navigation between the files needed to understand one operation while preserving runtime, owner, adapter, and public-contract boundaries.

Split when current behavior has independent change reasons or requires a dependency boundary. Consolidate only within one owner and one change reason. Treat forwarding-only modules, facade ladders, proxy families, single-consumer files without an independent contract, and delegation-only tests as review evidence, not automatic instructions.

Do not compress logic or distribute one broad state or effect authority across mechanical helper files. Put a multi-message, multi-transport, or multi-persistence transition in a named orchestration owner.

After a split or consolidation, prove no new cycle, dual authority, cross-owner import, broad facade or state bag, forwarding layer, dead export, generic helper, or UI owner with privileged, persistence, or transport effects. Preserve reachable ordering, failure, rollback, and cleanup behavior.

Follow machine-reported structural limits and allowances from [code quality](../tooling/code-quality.md). Use JSDoc for public contracts. Use inline comments only for invariants, platform behavior, protocol boundaries, or explicit tradeoffs. Do not retain commented-out code.

## Proof selection

Select proof from affected behavior, risks, and consumers. Do not select tests only from edited filenames. Do not add behavior solely to make a test matrix symmetric.

Prove transitive consumers of a changed shared contract. For parser changes, apply [parser architecture](../architecture/parser-architecture.md#diagnostics-and-proof). For persistence changes, prove each reachable changed operation and its failure or concurrency behavior. For UI, messaging, and async changes, prove a failure, duplicate, replay, stale result, rollback, or restore state only when the changed flow exposes it.

Use exact owner-direct tests only when the machine owner mapping is complete and the change-risk report admits them. Otherwise use transitive affected-test discovery. Test cost does not reduce required coverage.

For an escaped defect, add failing proof before the fix. Record why existing proof missed the defect. Add a deterministic guard only when the same defect family is machine-detectable without heuristic debt.
