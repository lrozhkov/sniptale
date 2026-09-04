# i18n architecture

Sniptale ships Russian and English. `packages/platform/src/i18n/config.ts` owns locale identifiers, Intl tags, display names, and the fallback locale. The background install owner persists English on first installation and preserves the stored locale on update.

## Owners

- `packages/platform/src/i18n/**` owns package-pure locale configuration and formatting.
- `apps/extension/src/platform/i18n/messages/**` owns product messages with locale variants colocated at each leaf.
- `apps/extension/src/platform/i18n/dictionaries.ts` builds runtime dictionaries.
- `apps/extension/src/platform/i18n/types.ts` derives translation keys and contracts.
- `apps/extension/src/platform/i18n/locale/state.ts` owns preference persistence, events, and subscriptions.
- `apps/extension/src/platform/i18n/locale/hook.ts` owns React locale subscription.
- `apps/extension/src/platform/i18n/index.ts` is the app runtime API.
- `apps/extension/src/background/runtime/routing/runtime-wiring/install.ts` owns first-install locale initialization.

## Change rules

Put product copy in message section modules. Use shared formatters for locale-aware dates, numbers, and lists. Subscribe adopted React surfaces through the locale seam. Add both shipped translations for each new or changed user-facing message.

When adding a locale, update the registry, every message leaf, dictionary and key proof, formatter proof, preference behavior, and affected surface tests.
