# Storage state authority

This document defines the ownership rules for state that can outlive one runtime instance. Live service-worker maps under `apps/extension/src/background/application/runtime-state/**` describe runtime authority; persistence owners describe durable, session, advisory, and disposable state.

## State classes

- Authoritative state drives user-visible or privileged behavior and must have one persistence owner, explicit mutation APIs, ordering rules, failure behavior, and recovery proof.
- Session state coordinates a bounded browser or extension lifetime and must define expiry, stale-entry handling, and storage-unavailable behavior.
- Advisory state may be rebuilt or dropped and must not become a hidden prerequisite for product correctness.
- Disposable state belongs to a page or runtime instance and becomes durable only through an explicit persistence mutation.

Browser storage, IndexedDB, in-memory caches, and React state must not act as parallel authorities. A fallback cache is allowed only when its owner defines which backend wins, how it is reconciled, and what is lost on restart.

## Owners

`apps/extension/src/composition/persistence/infrastructure/browser-storage/index.ts` owns the shared browser-storage adapter and state-domain registration. Named concerns under `apps/extension/src/composition/persistence/**` own cross-runtime settings, projects, media, browser-storage, IndexedDB, backup, export-ledger, and sensitive AI persistence.

`apps/extension/src/background/storage/**` owns background-only activation caches, diagnostics recovery, metadata history, recording/export leases, route capabilities, and scenario session recovery that must not become shared app contracts.

Persisted DTOs and codecs for those background-only records stay under their named background storage concern. Feature runtimes may depend inward on that narrow contract; storage concerns must not import feature implementations to obtain persisted types, validation, or logging.

Runtime-local project and workspace adapters stay with the editor, video editor, scenario editor, content runtime, or native-transfer owner when their lifecycle is intrinsic to that runtime. Durable schemas and historical upgrade ladders remain composition-owned.

## Mutation invariants

Reads named `get`, `list`, `load`, or `read` are read-only. They may parse, normalize returned values, drop invalid fields, and report warnings, but repair, migration, reconciliation, expiry cleanup, and backfill writes require explicit mutation or maintenance owners.

Read-modify-write flows serialize through their owner and reload the latest authoritative value before mutation. Revisioned domains reject stale generations. Security capabilities and leases validate scope, sender or owner, purpose, freshness, expiry, and replay state before side effects.

Write failure must either reject to the workflow that owns recovery or follow a documented fail-soft policy for advisory state. A UI cache must not claim success after an authoritative write fails, and rollback or compensation must restore the previous visible state when optimistic mutation was exposed.

## StateManager adoption

Use `StateManager` only when the domain needs registered adapters, explicit key revisions, and durable stale-write rejection. Moving an owner requires domain registration, adapter ownership, migration and reconciliation behavior, negative stale-revision proof, transitive consumer proof, and removal of the previous authority in the same change.

Do not move security-specific secret transitions, temporary capabilities, bounded advisory history, or page-local state into a generic manager merely for consistency. Their current narrow owners retain authority until their invariants require a different backend.
