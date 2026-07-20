# Platform patterns and tradeoffs

This document records current sanctioned divergence that should not be treated as a defect without a changed product, threat-model, or ownership requirement.

## Extension page bootstrap

Extension pages use the shared `renderPageShell` owner for root lookup, theme bootstrap, locale binding, and fatal error handling. Lightweight pages keep entrypoints thin. Editor-style pages may add page-owned startup hooks such as tracer initialization, delayed runtime-bridge registration, or `StrictMode` when those effects remain outside the entrypoint.

An entrypoint must not absorb routing, persistence, browser transport orchestration, or domain behavior. Move a repeated page-specific hook into a shared owner when it appears across multiple runtimes or begins to carry independent policy.

## State patterns

Small page-shaped surfaces may use owner-local hooks or stores. Editors may use controller and store seams for workspace history and project orchestration. Convergence requires a concrete ownership problem, repeated defect, duplicated behavior, or measurable runtime cost; stylistic difference alone is not a reason to merge state models.

Thin default facades are permitted when the factory-created or injectable owner remains available and the facade adds no caller-specific policy.

## Accepted tradeoffs

### Transparent local secret crypto

`@sniptale/platform/security/local-secret-crypto` may keep ciphertext and an extension-local AES key in the same browser profile when passphrase protection is disabled. This reduces accidental plaintext exposure but does not protect a compromised profile and is not equivalent to passphrase or hardware-backed storage.

Passphrase protection is opt-in. Its unlocked key material belongs to the background runtime's in-memory owner and is lost when the worker restarts. Exact secret and retention rules live in [data handling](../security/data-handling.md).

### Open Shadow DOM

`packages/platform/src/browser/shadow-dom/index.ts` uses open Shadow DOM for inspectable, testable, extension-owned content surfaces. It provides style and ownership isolation, not a security boundary.

### String snapshot history

`packages/foundation/src/history/snapshot-history.ts` is generic, while current production consumers store strings. Mutable object snapshots require a separate semantics decision for cloning and equality before adoption.

### Lazy default messaging transport

`apps/extension/src/platform/runtime-messaging/default-transport.ts` lazily creates the default transport over `createRuntimeMessagingTransport(...)`. The singleton is acceptable only while it remains a browser-binding convenience with no business policy, caller-specific retry state, or context-dependent behavior.

## Review rule

Treat a sanctioned tradeoff as remediation work only when current behavior is unsafe, its assumptions no longer hold, or it has become a demonstrated ownership or maintenance hotspot. Update this document in the same change that alters the accepted boundary.
