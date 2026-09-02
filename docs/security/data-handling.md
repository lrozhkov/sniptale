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
- Treat previews, thumbnails, caches, staging objects, and temporary jobs as non-authoritative.
- Exclude local media, temporary payloads, and caches from sync, automatic export, diagnostics, and traces.
- Include data in backup only when the backup contract explicitly names it.
- Abort active writers before local-data erasure. Remove registered browser storage, IndexedDB, OPFS, caches, staging objects, and legacy stores covered by the erasure contract. Verify absence before reporting success.
- Apply retention limits and cleanup events from `sensitiveRetentionOwners` in the storage inventory.

Web Snapshots may retain sanitized HTML and CSS, non-credential form state, and a raster after an explicit user action. Label a viewport-only raster as partial, store it as `page-viewport-preview.png`, and never publish it as `page-screenshot.png`. Remove recognized password, sign-in-code, and payment state from retained DOM. Mask those controls in the raster when they are reachable. Exclude scripts, handlers, unsafe URLs, storage, cookies, API bodies, and live JavaScript state. Disclose that screenshots may still contain visible private pixels from images, canvas, video, or closed shadow roots.

Raw voice transcripts and recognition results are session-only. Send them only to the authorized Port that owns the active request. A recognition event must not persist, commit, or export text. Text becomes ordinary annotation content only after the user explicitly commits it.

LLM request history may retain only timestamp, model ID, request kind, result count, status, and fixed error code. Normalize legacy prompt-bearing records before returning them. Before model egress, disclose the provider, model, prompt inclusion, page-data classes, and metadata-only history.

## Network egress

- Resolve AI secrets and build authorization headers only in the registered background transport.
- Allow `credentials: 'include'` only for registered owners after same-origin URL validation.
- Fetch user-enabled cross-origin Web Snapshot assets anonymously with `credentials: 'omit'`.
- Accept cross-origin Web Snapshot responses only from public HTTPS final URLs.
- Install the Declarative Net Request session guard before a redirect-enabled Web Snapshot fetch. Reject the fetch if guard installation fails.
- Block HTTP and syntactically private or local redirect hops. Treat DNS rebinding as a residual browser limitation because fetch and Declarative Net Request do not expose the resolved IP.
- Keep archived links inert. Open a validated HTTP(S) target in a new tab only after the user enables the default-off control and clicks the link.

## Import and export

Treat every imported file and archive as hostile input. Parse it as `unknown`. Enforce the format version, schema, exact inventory, path and MIME policy, size and resource limits, identity uniqueness, and storage quota before mutation. Revalidate after user confirmation when the flow has a preview step. A failed import must not publish a partial durable aggregate.

Settings transfer includes only transferable persisted controls. Exclude credentials, credential-presence flags, cryptographic material, protection state, device identifiers, projects, media, caches, permission grants, and runtime state. Include prompts or private base URLs only after point-of-action disclosure. Enforce the limits from [Settings transfer limits](../../apps/extension/src/contracts/settings-transfer/limits.ts). Surface an unverified rollback as a blocking failure.

Page Package transfer uses bounded sequential chunks and temporary OPFS staging. Do not assemble the archive in service-worker memory. Before download or Library publication, verify the manifest, intent, exact inventory, paths, MIME profile, sizes, and entry SHA-256 values through an abortable stream. Discard staging after success, failure, cancellation, erasure, or owner release.

Extended page evidence is opt-in. Store its DOM projection as plain text, never render it as HTML, and pass every scalar through the diagnostic sanitizer. Exclude form state, cookies, storage, authorization data, bodies, scripts, stylesheets, `srcdoc`, file values, and live JavaScript state. Disclose that visible page text, ordinary attributes, and safe URL query values may remain.

## Diagnostics

- Sanitize persisted, exported, logged, or traced diagnostics with `packages/platform/src/observability/diagnostics/sanitizer.ts`.
- Limit exceptions to `diagnosticSanitizerOwners` in the storage inventory.
- Use fixed codes and bounded metrics instead of raw exceptions, content, identifiers, URLs, blobs, transcripts, audio, or media bytes.
- Apply the sanitizer again at the final persistence or export sink.

The registry-driven `verify-secret-storage`, `verify-sensitive-retention`, `verify-fetch-ownership`, and `verify-diagnostic-sanitization` controls enforce owner admission. Change the matching registry and this policy together when a security decision changes.
