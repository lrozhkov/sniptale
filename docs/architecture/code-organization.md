# Code organization

This document owns source placement and dependency direction. The [repository overview](repository-overview.md) maps paths at the top level. [Shared topology](shared-topology.md) owns package and app-core residency.

## Dependency direction

```text
foundation -> runtime-contracts -> platform -> ui -> extension app
```

Dependencies may skip layers. They must not reverse the layer order. Packages must not import `apps/extension/**`. Imports between packages must use declared `package.json#exports`. Relative imports must stay inside one package.

Runtime folders must not import implementations from sibling runtimes. Reuse across runtimes must use an exact package export or a concrete app-core owner. Only `apps/extension/src/web-snapshot-viewer/preparation/**` may import `apps/extension/src/content/public/preparation-surface/**` as an exception to the sibling-runtime rule.

## Owner folders

Name a folder for the behavior, contract, state authority, UI surface, effect boundary, or workflow that it owns. Inside that folder, name files by role. Examples include `view`, `state`, `service`, `adapter`, `parser`, `guards`, and `test-support`.

Keep runtime-neutral Page Package composition under `apps/extension/src/workflows/page-package`. Keep its temporary OPFS sink under `apps/extension/src/composition/persistence/assets`. Keep capture, messaging, publication, retention, and download effects in their existing runtime or composition owners. Keep the hostile Page Package manifest parser in `@sniptale/runtime-contracts/page-package`.

Let content own the Page Package message archive sink. Let the background job own job, tab, ordinal, and staged-object identity. Apply the [transfer policy](../security/data-handling.md#import-and-export) to staging, validation, publication, and cleanup.

## Public surfaces

Package public surfaces are exact exports. App-core surfaces across runtimes are explicit owner paths. Do not add root barrels or wildcard package exports. Do not add import-time effects outside init or service owners. Do not add compatibility facades that hide ownership.

## Topology changes

Apply the split, consolidation, and proof rules in [implementation rules](../engineering/implementation-rules.md#code-shape). Tests stay beside their owner. Test support must remain private to its owner.
