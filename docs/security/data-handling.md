# Security data handling

This document owns retention, secret handling, network egress, transfer, and diagnostic policy. The machine inventories own exact sinks and owner paths:

- `tooling/configs/qa/security-storage-ownership.data.json`
- `tooling/configs/qa/security-network-ownership.data.json`

## Secrets

- Keep provider metadata separate from credentials.
- Never put plaintext API keys, passphrases, authorization headers, or derived keys in storage, logs, UI responses, exports, diagnostics, or traces.
- Encrypt stored provider secrets with AES-GCM and a unique IV per secret.
- Apply the accepted [transparent-mode tradeoff](../architecture/platform-patterns-and-tradeoffs.md#security-tradeoffs).
- Limit secret writes to `secretStorageOwners` in the storage inventory.
- Limit secret-bearing headers to `secretHeaderOwners` in the network inventory.

Passphrase protection is optional. Its persistent metadata may contain only the mode, version, KDF parameters, salt, and encrypted verifier. [Local secret crypto](../../packages/platform/src/security/local-secret-crypto.ts) owns the algorithm and parameter values. Derived keys remain in background memory and disappear when the MV3 worker stops.

Write a transition marker before changing protection mode or resetting secrets. Recovery must finish committed cleanup or fail closed. A reset removes provider secrets because a forgotten passphrase is unrecoverable.

An unlock request may persist session metadata under `AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY`. Limit the record to request identity, extension-page owner, purpose, status, timestamps, and a fixed failure reason. Route unlock through the background owner and the Settings page. Do not render an unlock prompt in a content page.

## Retention

- Retain page content or user media only for an explicit product feature and an owner registered in the storage inventory.
- Keep durable media bytes in immutable OPFS objects. Keep identity, ownership, lifecycle, and publication state in IndexedDB.
- Publish an OPFS object and its IndexedDB graph atomically through the persistence-transition owner.
- Treat previews, thumbnails, caches, staging objects, and temporary jobs as non-authoritative. Timeline WebP thumbnails use the existing local preview-cache IndexedDB database, bounded to 32 MiB, 2048 frames, and 14 days. Reads do not renew retention; project deletion and local-data erasure remove them and invalidate pending writes.
- Exclude local media, temporary payloads, and caches from sync, automatic export, diagnostics, and traces.
- Include data in backup only when the backup contract explicitly names it.
- Abort active writers before local-data erasure. Remove registered browser storage, IndexedDB, OPFS, caches, staging objects, and legacy stores covered by the erasure contract. Verify absence before reporting success.
- Apply retention limits and cleanup events from `sensitiveRetentionOwners` in the storage inventory.

Web Snapshots may retain sanitized HTML and CSS, non-credential form state, and a raster after an explicit user action. Label a viewport-only raster as partial, store it as `page-viewport-preview.png`, and never publish it as `page-screenshot.png`. Remove recognized password, sign-in-code, and payment state from retained DOM. Mask those controls in the raster when they are reachable. Exclude scripts, handlers, unsafe URLs, storage, cookies, API bodies, and live JavaScript state. Disclose that screenshots may still contain visible private pixels from images, canvas, video, or closed shadow roots.

Raw voice transcripts and recognition results are session-only. Send them only to the authorized Port that owns the active request. A recognition event must not persist, commit, or export text except for the user-requested field behavior described below. Text becomes ordinary annotation content only after the user explicitly commits it. In the scenario editor, final dictated text inserted into a field becomes ordinary project content through the existing editing, undo history, and local autosave path; no separate Apply or Save action is required. Recognition events, interim results, and audio remain session-only. Gallery video review additionally retains the final text inserted into its comment field as local recovery draft, including final dictated text, until Save, explicit discard, or media deletion. This user-requested field recovery is separate from committed undo history: recognition events, interim results, and audio remain session-only. Explicit media backup includes the review history and recovery draft; annotation reports include committed comments only. Neither form is sent to sync, diagnostics, or logs.

LLM request history may retain only timestamp, model ID, request kind, result count, status, and fixed error code. Normalize legacy prompt-bearing records before returning them. Before model egress, disclose the provider, model, prompt inclusion, page-data classes, and metadata-only history.

Export-time calibration retains only numeric prediction-error ratios, completion timestamps and constrained codec/render-profile buckets in local browser storage under `sniptale_export_time_history`. The advisory owner keeps at most 100 observations, ten per profile, for 30 days. It excludes media, filenames, project identities, content and device fingerprints, and is excluded from sync, backup, export, diagnostics and traces. Reads do not renew retention or repair storage. Only successful rendering records an observation; unavailable storage or coordination discards it. Abort checks and nonqueued persistence permits protect writes during local-data erasure, whose inventory removes and verifies the key even when preferences are preserved.

## Network egress

- Resolve AI secrets and build authorization headers only in the registered background transport.
- Allow `credentials: 'include'` only for registered owners after same-origin URL validation.
- Fetch user-enabled cross-origin Web Snapshot assets anonymously with `credentials: 'omit'`.
- Accept cross-origin Web Snapshot responses only from public HTTPS final URLs.
- Install the Declarative Net Request session guard before a redirect-enabled Web Snapshot fetch. Reject the fetch if guard installation fails.
- Block HTTP and syntactically private or local redirect hops. Treat DNS rebinding as a residual browser limitation because fetch and Declarative Net Request do not expose the resolved IP.
- Keep links inert in the embedded Web Snapshot viewer. Open a validated HTTP(S) target there only after the user enables the default-off control and clicks the link. Downloaded standalone HTML may expose validated HTTP(S) links in a new tab with `noopener noreferrer` and same-file fragment links; it must not load external assets or run page scripts.

## Import and export

Treat every imported file and archive as hostile input. Parse it as `unknown`. Enforce the format version, schema, exact inventory, path and MIME policy, size and resource limits, identity uniqueness, and storage quota before mutation. Revalidate after user confirmation when the flow has a preview step. A failed import must not publish a partial durable aggregate.

Settings transfer includes transferable persisted controls and explicitly selected video-editor effect catalogs (validated imported documents and bundled assets). The effect-bundles persistence owner stores source-qualified preset/default/enabled preferences in local browser storage under `videoEffectPreferences`, bounded to 1 MiB; settings transfer includes these preferences and retains unavailable effect/style references. Built-in effect definitions remain immutable extension resources and are excluded from settings backup. Exclude credentials, credential-presence flags, cryptographic material, protection state, device identifiers, projects, media, caches, permission grants, and runtime state. Include prompts or private base URLs only after point-of-action disclosure. Enforce the limits from [Settings transfer limits](../../apps/extension/src/contracts/settings-transfer/limits.ts). Surface an unverified rollback as a blocking failure.

Page Package transfer uses bounded sequential chunks and temporary OPFS staging. Do not assemble the archive in service-worker memory. Before download or Library publication, verify the manifest, intent, exact inventory, paths, MIME profile, sizes, and entry SHA-256 values through an abortable stream. Discard staging after success, failure, cancellation, erasure, or owner release.

Extended page evidence is opt-in. Store its DOM projection as plain text, never render it as HTML, and pass every scalar through the diagnostic sanitizer. Exclude form state, cookies, storage, authorization data, bodies, scripts, stylesheets, `srcdoc`, file values, and live JavaScript state. Disclose that visible page text, ordinary attributes, and safe URL query values may remain.

## Diagnostics

- Sanitize persisted, exported, logged, or traced diagnostics with `packages/platform/src/observability/diagnostics/sanitizer.ts`.
- Limit exceptions to `diagnosticSanitizerOwners` in the storage inventory.
- Use fixed codes and bounded metrics instead of raw exceptions, content, identifiers, URLs, blobs, transcripts, audio, or media bytes.
- Apply the sanitizer again at the final persistence or export sink.

The registry-driven `verify-secret-storage`, `verify-sensitive-retention`, `verify-fetch-ownership`, and `verify-diagnostic-sanitization` controls enforce owner admission. Change the matching registry and this policy together when a security decision changes.

Gallery trash retains the existing local media and project graphs after a reversible delete gesture. It introduces no additional storage backend, network transfer or diagnostic payload. Retention is indefinite by default; an independent opt-in age policy permits permanent cleanup during Gallery maintenance. Automatic cleanup must not detach project references. Manual permanent deletion requires confirmation; privacy erasure includes retained trash through the existing stores and asset owners.


Standalone scenario HTML exports retain the exact native guide or tour file as an immutable local OPFS body after an explicit export action. The `scenario-html-exports` persistence owner publishes its catalogue identity, reference and body ownership atomically through the existing ready-journal transition. Native file commit precedes advisory catalogue retention; a retention failure does not claim a saved Library file. Replay preserves a committed filename or Trash state. Catalogue deletion, source-root deletion and archive replacement release body ownership through the existing durable physical-delete journal. Verified local-data erasure removes these bytes with the existing OPFS store and IndexedDB graph.

An explicit scenario backup includes the saved HTML body, mode and filename through portable object identities. These immutable files contain the visible authored content and resources chosen at export time; metadata privacy projections do not rewrite their content. They are excluded from sync, automatic export, diagnostics and traces. Legacy metadata-only catalogue entries have no recoverable file and must never regenerate a current project under a historical export identity. Treat restored HTML as hostile: read-only preview admission runs inside the opaque sandbox and checks an extension-trusted runtime digest plus the restrictive mode-specific CSP. Trusted runtimes are the current extension-supplied bundled digest and the explicitly pinned pre-caption-alignment and pre-viewer-controls guide digests and pre-marker-controls, pre-stage-background, pre-manual-playback, pre-full-view, pre-highlight-animation, pre-narration-controls and pre-background-music tour digests in the sandbox admission owner. Historical trust stays representation-specific: guide pins never apply to Tour, and tour pins never apply to Guide. Both the exact CSP and executable bytes must match the trusted digest, and archive-supplied hashes cannot add trust. Admission performs these checks before mounting the original file. The saved file receives no privileged extension APIs or same-origin access.

Background preset metadata is local-only under `sniptale_background_presets`: at most 20 immutable bundled entries and 200 custom entries with bounded names, Library identities, enabled state and order. It stores no image bytes or network URLs and is excluded from sync, settings transfer, diagnostics and traces. Local-data erasure removes it even when preferences are preserved. Custom images are explicitly retained in Library through the existing asset publication owner; removing a catalog entry does not delete its Library material. Missing or trashed materials cannot be selected. Editor insertion keeps its existing frozen bytes and source provenance without publishing a second Library card.

### Explicit Gallery speech editing

Gallery speech editing is distinct from session-only browser voice input. Explicitly accepted transcripts and phrase edits become project content through review history. Accepted generated audio uses the existing private project-asset publication and reference-retention rules. Project backup includes those accepted references and text; it excludes jobs, secrets and temporary previews.

`background/ai/audio/request.ts` alone assembles audio provider bearer headers. It sends only the authorized extracted interval or saved phrase to the selected provider, rejects redirects, omits ambient credentials and referrers, and bounds response bytes and elapsed time. Provider error bodies never enter UI, logs or diagnostics. There is no hidden retry after an ambiguous paid POST.

`composition/persistence/assets/audio-staging.ts` retains disposable input and previews under `sniptale-assets/audio-jobs`. Objects have random operation identities, a 32 MiB maximum (transcription inputs are additionally limited to 24 MiB), and a ten-minute access expiry. Successful jobs discard input; the page discards previews on release. Subsequent writes inspect at most 256 metadata entries for expired crash remnants. Expired bytes may remain physically until that cleanup or verified local-data erasure; no scheduled cleanup is implied. Staging is excluded from backup, sync and diagnostics. Scopes distinguish original source from a specific voiceover clip; staged handles cannot cross those targets. Original admission resolves the current Library source and compares immutable identity, MIME and size to the durable workspace. Provider admission additionally checks physical bytes and retained native coverage; it repeats this validation before egress and after response. Every write rechecks the current durable workspace and original source binding inside the existing persistence transition; a delayed page extraction cannot recreate bytes after erasure. Full erasure cancels background operations and deletes the existing asset root.

Quick-editor preview preferences retain only four bounded resolution, frame-rate, paused-quality and FPS-display choices locally under `sniptale_quick_preview_preferences`. They contain no content or device identifiers and are excluded from sync, project history, backup, export and diagnostics. Missing or failed storage leaves the current session editable without claiming a durable save. Reads do not repair storage. Writes acquire a nonqueued persistence permit before joining their local ordered queue and hold it through the write, so pending erasure cannot be followed by a stale queued save. Verified local-data erasure removes this key unless the existing preserve-preferences option is selected.

The Library maintenance journal is user-requested local advisory diagnostic history at `sniptale_library_maintenance_log`. It retains only fixed operation/reason codes and reconstructed messages, UTC timestamps and bounded numeric metrics. It contains no source IDs, names, URLs, media, user content or raw exception text. The owner bounds it to 512 entries and 256 KiB, evicts oldest rows and merges consecutive identical blocked/error/skipped outcomes within one minute with explicit first/last timestamps and repetition count. A cross-context lock reloads current state before append; an erasure permit is admitted before queueing and drains before unconditional erasure removes the key. Read is write-free. Storage/coordination failure loses advisory events without failing cleanup or logging to Chrome errors. Offscreen submissions use the bounded internal runtime Port; background accepts maintenance envelopes only from the exact offscreen document, reconstructs the fixed-code input and applies its own erasure admission before storage. No caller-supplied message or content is retained. The journal never authorizes deletion or repair. It is excluded from sync and backup; explicit filtered JSONL export reconstructs and sanitizes each entry again at the final sink.

The user-requested Settings System → Events and logs surface also retains runtime logger summaries at `sniptale_runtime_diagnostic_log`, separately bounded to 512 rows/256 KiB. Each event contains UTC times, level, runtime label, logger namespace, sanitized short message and repetition/drop counts. Captured producers use fixed summaries or controlled codes/numeric metrics; DOM headings/selectors, project identities, native media constraints and raw exceptions must not be interpolated into the first message. Attached arguments, documents, media, provider bodies and raw error stacks are discarded. The shared diagnostic sanitizer protects retention and explicit JSONL export; this is local-only, excluded from backup/sync and unconditionally erased with local data. Runtime capture batches at most64 events over one second, drops overflow explicitly, holds an admitted mutation permit through batching and writing, and reloads under an exclusive cross-context lock. Storage failure never retries, logs recursively or blocks product work. No event means no timer or storage activity.
