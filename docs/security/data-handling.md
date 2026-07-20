# Security data handling

Updated: 2026-07-19

## Scope

This policy covers AI credentials and request history, secret-bearing network traffic, retained page data, diagnostics, exports, and tracing payloads. `tooling/configs/qa/security-storage-ownership.data.json` and `tooling/configs/qa/security-network-ownership.data.json` are the machine-readable owner inventories.

## AI provider secrets

- Provider metadata is separate from API secrets and may include only identifiers, display/configuration fields, timestamps, connection type, and `hasStoredApiKey`.
- Plaintext API keys and passphrases must never enter local, sync, or session storage, logs, UI responses, exports, diagnostics, or traces.
- Stored provider secrets use AES-GCM with per-secret IVs. Transparent mode keeps an extension-local key and is obfuscation against accidental inspection, not protection from a compromised browser profile or extension runtime.
- The approved storage owners are the exact `secretStorageOwners` entries in the storage ownership registry. The pre-v3 migration remains an explicit current-backend exception for converting legacy plaintext records and cleaning obsolete state.

### Optional passphrase protection

- Passphrase protection is opt-in. Enabling it decrypts transparent-mode envelopes, re-encrypts them with a passphrase-derived key, persists only non-secret protection metadata, removes `AI_LOCAL_SECRET_KEY_STORAGE_KEY`, and keeps the unlocked derived key only in background-runtime memory.
- Persistent `AI_SECRET_PROTECTION_KEY` metadata may contain mode, version, KDF parameters, salt, and an encrypted verifier, never raw key material.
- Passphrase-derived key material is in-memory only. It must not be written to local, sync, or session storage. `AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY` is a legacy cleanup constant and never authorizes persistence.
- Transition markers are non-secret and must be written before durable enable, disable, or reset changes. Recovery removes stale markers, completes committed cleanup, or fails closed without simultaneous valid passphrase metadata and transparent key material.
- Unlock request metadata may use session storage only under `AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY` and may contain request identity, extension-page ownership, purpose, lifecycle status, timestamps, and terminal failure reason. It must not contain passphrases, derived keys, API keys, prompts, page payloads, cookies, authorization headers, or secret envelopes.
- The current KDF is PBKDF2-HMAC-SHA-256 with 600,000 iterations, a 16-byte salt, and a 256-bit AES-GCM key. Metadata is versioned for an explicit future KDF or trust-anchor migration.
- A local-storage dump must not decrypt passphrase-protected secrets. Weak passphrases, an active unlocked runtime, and a compromised extension remain residual risks.
- Forgotten passphrases are unrecoverable. Reset clears provider secrets and marks providers as missing stored keys.
- Provider-backed features unlock through the background-owned flow and extension settings page at `apps/extension/src/settings/index.html?aiUnlock=1&requestId=...`; content pages must not render passphrase overlays. Chrome built-in AI does not use this path.
- The unlock cache is fail-closed and disappears with MV3 worker memory. After worker eviction or restart, secrets remain locked until a new unlock succeeds; recovered completed requests report `restart-required` when their in-memory key is gone. See the [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Sensitive retention

- Browser storage must not retain page-derived prompts, Markdown/JSON payloads, raw responses, HTML, cookies, or authorization values unless an explicit registry owner and policy exception exist.
- User-requested web snapshots may retain sanitized HTML/CSS only in IndexedDB `web_snapshots` with a linked media entry. Scripts, handlers, unsafe URLs, credentials, browser storage, page IndexedDB, API bodies, and live JavaScript state remain excluded.
- Page-style templates and restore rules may retain allowlisted style patches, selector identity, explicit address/domain scope, state, timestamps, and lightweight asset references. Page text or image restoration requires per-rule user opt-in; image binaries belong in IndexedDB `page_style_assets`, referenced by id rather than inline base64.
- LLM history is metadata-only: timestamp, model, request kind, counts, and status. Legacy prompt-bearing records are normalized away on read.
- Model egress uses the shared payload-bound lease, proof, normalization, redaction, and transport pipeline. Point-of-action UI discloses provider, model, prompt inclusion, page-data classes, and metadata-only retention before submit.
- Scenario pending-capture session state may hold metadata and a temporary asset reference; screenshot blobs stay in the scenario temp-asset store.
- User-selected video-editor Cache mode may retain local-only derived AVC preview segments in the dedicated IndexedDB database `sniptale-video-preview-cache`. The cache is advisory, limited to 14 days, 12 records, and 512 MiB, excluded from project export, backup, sync, and diagnostics, removed before project deletion, and always removed and absence-verified by local-data erasure. Preview preferences follow `preservePreferences`; derived media never does.

## Network secret ownership

- Secret-bearing headers belong only to canonical transport owners. The approved AI owner is `apps/extension/src/background/ai/llm/transport/request.ts`.
- `fetch(..., { credentials: 'include' })` is authenticated page-context traffic and is allowed only for exact owners in the network registry. Owners must narrow page-derived URLs and reject cross-origin or suspicious targets.
- Web-snapshot credentialed asset fetches are same-origin only. User-enabled external assets use background-owned anonymous fetches with `credentials: 'omit'`, reject obvious private targets and redirects, and fail as warnings. DNS rebinding remains a residual browser limitation because `fetch` does not expose the resolved IP.
- Snapshot save UI discloses retained screenshot, sanitized content, source metadata, diagnostics, warnings, and enabled asset captures; authenticated or external asset capture requires explicit acknowledgement.

## Diagnostics

- Persisted, exported, logged, or traced diagnostics pass through `packages/platform/src/observability/diagnostics/sanitizer.ts`.
- Only exact `diagnosticSanitizerOwners` entries are tracer exceptions. Other collectors and sinks must import the canonical sanitizer and prove sanitization before every write.
- Recording diagnostics UI discloses captured tab URL, sanitized console/errors, network failures, service logs, IndexedDB retention, and JSON/ZIP export behavior before enablement or download.
- Preview-cache diagnostics contain fixed reason codes, counts, durations, byte totals, and phase names only. They exclude project IDs, digests, fingerprints, source URLs, blobs, frame content, document source, and asset bytes.

## Deterministic guardrails

`verify-secret-storage`, `verify-sensitive-retention`, `verify-fetch-ownership`, and `verify-diagnostic-sanitization` enforce these registry-driven rules. A new owner requires the registry and this policy to change together.
