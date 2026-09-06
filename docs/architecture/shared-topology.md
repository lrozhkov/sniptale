# Package and app-core topology

Put cross-runtime code in a dependency-closed package or a concrete app-core owner. Do not create a generic shared source root.

## Package roles

Apply the dependency direction in [code organization](code-organization.md#dependency-direction). Package consumers must declare direct workspace dependencies.

- `packages/foundation` owns dependency-free, side-effect-free primitives.
- `packages/runtime-contracts` owns wire and data contracts plus validation primitives.
- `packages/platform` owns package-pure ports and browser, data, i18n, observability, and security adapters.
- `packages/ui` (`@sniptale/ui`) owns reusable presentation and interactions without app persistence or product catalogs.

## App-core residency

Keep app-core contracts and implementations app-local when they require extension lifecycle, product state, concrete persistence, product copy, feature authority, or runtime composition. Generated [project facts](../engineering/project-facts.md) project the current app-core roots.

`apps/extension/src/composition/persistence` owns shared schemas, upgrades, browser-storage composition, cross-runtime persistence adapters, and transaction coordination. Features and workflows own product behavior. Runtime-specific adapters remain in their runtime.

`tooling/configs/qa/app-core-owner-policy.data.json` owns declared authority owners, forbidden edges, entrypoints, and barrel rules. The live tree owns the app-core inventory.

## Change rule

Add a package export only for an existing cross-owner consumer. Promote code to a package only when its dependency closure is package-safe and it has no extension lifecycle, persistence, product catalog, or product-state dependency.
