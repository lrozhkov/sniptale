# Platform patterns and tradeoffs

This document records intentional exceptions to shared platform patterns. Treat an exception as remediation only under either condition:

- Its stated assumption fails.
- Current behavior violates a product, security, or ownership requirement.

## Page bootstrap and state

Use `renderPageShell` for extension-page root lookup, theme bootstrap, locale binding, and fatal errors. Keep routing, persistence, transport orchestration, and domain behavior outside entrypoints. Keep a startup hook local to its page until a second runtime needs the same policy.

Page-local hooks, stores, and editor controllers may coexist only if their state, effect, and lifecycle authorities do not overlap. If an authority overlaps, use one owner. Otherwise, unify them only to fix demonstrated behavior duplication or measured runtime cost.

`apps/extension/src/platform/runtime-messaging/default-transport.ts` may create the injectable default transport lazily under the [factory and facade rule](../engineering/implementation-rules.md#ownership-selection). It must not own retries specific to a caller or state that depends on context.

## Security tradeoffs

If passphrase protection is off, `@sniptale/platform/security/local-secret-crypto` stores ciphertext and its AES key in the same browser profile. This protects against accidental plaintext disclosure, not profile compromise. [Data handling](../security/data-handling.md) owns secret and retention policy.

The offscreen `capabilityToken` field is a compatibility name for a payload binding. Its expiry, generation, and unkeyed hash supply inputs for freshness, consistency, and idempotency. They do not authenticate the sender. Exact checks of the background sender, derived from the browser, form the authorization boundary.

`packages/platform/src/browser/shadow-dom/index.ts` uses open Shadow DOM for inspection and style isolation. It is not a security boundary.

## History tradeoff

`packages/foundation/src/history/snapshot-history.ts` is generic, but current production consumers store strings. Before you store mutable objects, define cloning and equality.

Update this document with any change that adds, removes, or changes an exception.

## Event history

The advisory Events and logs history uses the dedicated `sniptale-event-history` IndexedDB database. It cannot participate in product publication transactions. It must remain available without admission or scans of `sniptale-db`. This isolates diagnostic writes from the failing or slow storage that they describe.

The existing browser-storage journals are bounded recent UI views, not archive authority. The history owner seeds them once on the first successful archive admission. Failure loses advisory history. It never authorizes or blocks product work. Local-data erasure has a required, checked participant for all four history stores.
