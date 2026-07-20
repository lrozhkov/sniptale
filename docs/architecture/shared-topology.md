# Package and app-core topology

Cross-runtime reuse belongs either to a dependency-closed workspace package or to a concrete app-core owner under `apps/extension/src`. There is no generic shared source root.

## Package graph

```text
@sniptale/foundation
        |
@sniptale/runtime-contracts
        |
@sniptale/platform
        |
@sniptale/ui
        |
@sniptale/extension
```

Edges flow downward in this list and may skip layers. Packages do not import `apps/extension/**`; cross-package consumers use exact exports and declare direct workspace dependencies.

- `packages/foundation` owns dependency-free, side-effect-free kernel primitives.
- `packages/runtime-contracts` owns dependency-closed wire/data contracts and validation primitives.
- `packages/platform` owns package-pure ports and browser, data, i18n, observability, and security adapters.
- `packages/ui` owns reusable presentation, tokens, styles, and interaction primitives without app persistence or product catalog authority.

## App-core residency

Code remains app-local when it requires extension lifecycle, product state, concrete persistence, product copy, feature authority, or runtime composition. The app-core roots are `apps/extension/src/contracts`, `features`, `foundation`, `platform`, `ui`, `workflows`, and `composition`.

`apps/extension/src/composition/persistence` owns shared database schemas, historical upgrades, browser-storage composition, cross-runtime persistence adapters, and transaction coordination. Named features and workflows own product behavior; runtime-local adapters stay with their runtime.

## Classification authority

`tooling/configs/qa/app-core-owner-policy.data.json` is the exact authority for current app-core paths, final owners, allowed edges, required authorities, and entrypoint rules. This document explains the model but does not duplicate that inventory.

Package-boundary and app-core-owner guards reject unclassified paths, reverse package edges, package-to-app edges, undeclared workspace dependencies, missing or bypassed exports, broad barrels, retired roots, forbidden feature/runtime/persistence edges, and misplaced lifecycle globals.

## Change rule

Add a package export only for a real cross-owner consumer. Promote code only when its dependency closure is package-safe and it has no intrinsic extension lifecycle, persistence, catalog, or product-state dependency. Otherwise place it in the narrow app-core owner and keep its public path explicit.
