# Platform patterns and tradeoffs

This document records intentional exceptions to shared platform patterns. Treat an exception as remediation only when its stated assumption fails or current behavior violates a product, security, or ownership requirement.

## Page bootstrap and state

Use `renderPageShell` for extension-page root lookup, theme bootstrap, locale binding, and fatal errors. Keep routing, persistence, transport orchestration, and domain behavior outside entrypoints. Keep a page-specific startup hook page-local until a second runtime needs the same policy.

Page-local hooks, stores, and editor controllers may coexist only when their state, effect, and lifecycle authorities do not overlap. Use one owner when an authority overlaps. Otherwise unify them only to fix demonstrated behavior duplication or measured runtime cost.

`apps/extension/src/platform/runtime-messaging/default-transport.ts` may lazily create the injectable default transport under the [factory and facade rule](../engineering/implementation-rules.md#ownership-selection). It must not own caller-specific retries or context-dependent state.

## Security tradeoffs

When passphrase protection is disabled, `@sniptale/platform/security/local-secret-crypto` stores ciphertext and its AES key in the same browser profile. This protects against accidental plaintext disclosure, not profile compromise. [Data handling](../security/data-handling.md) owns secret and retention policy.

The offscreen `capabilityToken` field is a compatibility name for a payload binding. Its expiry, generation, and unkeyed hash provide freshness, consistency, and idempotency inputs. They do not authenticate the sender. Exact browser-derived background sender verification is the authorization boundary.

`packages/platform/src/browser/shadow-dom/index.ts` uses open Shadow DOM for inspectability and style isolation. It is not a security boundary.

## History tradeoff

`packages/foundation/src/history/snapshot-history.ts` is generic, but current production consumers store strings. Define cloning and equality before storing mutable objects.

Update this document in the change that adds, removes, or alters an exception.
