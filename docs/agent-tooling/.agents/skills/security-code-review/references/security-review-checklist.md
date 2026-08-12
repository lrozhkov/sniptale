# Security Review Checklist

## Severity

- `P0`: exploitable remote code execution, credential leakage, destructive data loss, or broad silent permission bypass.
- `P1`: high-confidence sensitive-data exposure, privileged API misuse, authorization bypass, unsafe import/export, sanitizer bypass, or missing denial behavior for a privileged operation.
- `P2`: realistic but contained security/privacy risk.
- `P3`: low-risk hardening, clarity, or follow-up guardrail opportunity.

## IPC And Privileged Authority

- Messages from content, extension pages, offscreen documents, and background routes enter as untrusted.
- Runtime actions use the action-kernel and authorization-policy registries. Leaf routers consume named preauthorization handles instead of re-deciding authority.
- Sender class, freshness/replay policy, effects, and error shape are explicit. Denied, stale, replayed, duplicate, and malformed messages fail predictably.
- Raw `chrome.*` access stays behind `@sniptale/platform` browser adapters, app-local platform adapters, or a documented owner seam.
- Permission denial/revocation produces visible failure or safe degradation.

## Network, AI, And Sensitive Data

- Secrets stay in explicit resolution and transport owners; generic helpers do not receive plaintext keys or secret-bearing headers.
- Page-derived network/AI payloads are minimized, user-authorized, and not retained or logged unnecessarily.
- Credentialed fetches use approved owners and diagnostics, prompts, responses, and exports apply canonical sanitization/retention policy.

## Import, Export, And Rendering

- ZIP, JSON, imported markup, and binary payloads arrive as `unknown` and are parsed before domain use.
- Path traversal, oversized archives/assets, malformed MIME, unsupported versions, and unsafe output paths fail safely.
- Exports exclude secrets, raw diagnostics, and undeclared page data; project export/download sinks enforce authorization and denial behavior.
- No new `eval`, `new Function`, raw `innerHTML`, or unsanitized `dangerouslySetInnerHTML`; HTML/diagnostic/snapshot/import rendering uses the canonical sanitizer.

## Storage And Manifest

- Secrets are not persisted in plaintext outside approved owners. Read paths do not silently repair sensitive state.
- Delete, clone, project-delete, fallback, diagnostic, and export paths preserve retention policy.
- Permission and resource changes match `tooling/configs/qa/manifest-permissions.data.json`; optional grants originate in extension-owned UI and denied grants do not register privileged behavior.
- Web-accessible resources remain exact and resource-scoped.

Request changes for cast-trusted external payloads, widened authority without policy/denial behavior, unsafe secret or page-data retention, sanitizer bypass, unregistered manifest surface, or success-only proof for a failure-prone security path.
