# i18n architecture

Sniptale ships Russian and English. `packages/platform/src/i18n/config.ts` is the locale registry and owns locale identifiers, Intl tags, display names, and the default/fallback locale; Russian (`ru`) remains the fallback for uninitialized internal contexts. The background install lifecycle persists English (`en`) through the locale state owner on first installation, while updates preserve the existing preference.

## Owners

- `packages/platform/src/i18n/**` owns package-pure locale configuration and formatting primitives.
- `apps/extension/src/platform/i18n/messages/**` owns section-first product message sources with locale variants colocated at each leaf.
- `apps/extension/src/platform/i18n/dictionaries.ts` resolves runtime dictionaries from the source tree.
- `apps/extension/src/platform/i18n/types.ts` derives translation keys, dictionaries, and translator contracts.
- `apps/extension/src/platform/i18n/locale/state.ts` owns preference persistence, events, and subscriptions.
- `apps/extension/src/background/runtime/routing/runtime-wiring/install.ts` owns the first-install English preference and context-menu initialization order.
- `apps/extension/src/platform/i18n/locale/hook.ts` owns React locale subscription and is exported through `apps/extension/src/platform/i18n/index.ts`.
- `apps/extension/src/platform/i18n/index.ts` is the app runtime API for lookup, fallback, interpolation, and formatting helpers.

## Invariants

Product copy is authored in message section modules, not monolithic locale files or feature-local dictionaries. Source leaves contain the shipped locale variants, while resolved runtime dictionaries preserve stable `translate(key, locale?)` use. Translation and key types are inferred from the source tree.

Lookup and locale-aware formatting remain separate. Date, number, and list formatting use shared helpers and the locale registry; feature code does not hard-code `ru-RU`, `en-US`, or equivalent tags when a shared formatter owns the operation.

Adopted React surfaces subscribe through `useAppLocale()` or another explicit locale seam so preference changes rerender the current surface. New or changed user-facing text in an adopted surface uses dictionary keys and includes both shipped locales.

Locale display names derive from the registry. Adding a locale requires registry data, complete message coverage, dictionary/type proof, formatting proof, preference behavior, and affected surface tests in one coherent change.
