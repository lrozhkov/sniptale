# Code organization

This document owns source placement and dependency direction. The [repository overview](repository-overview.md) maps top-level paths. [Shared topology](shared-topology.md) owns package and app-core residency.

## Dependency direction

```text
foundation -> runtime-contracts -> platform -> ui -> extension app
```

Dependencies may skip layers but must not reverse them. Packages must not import `apps/extension/**`. Cross-package imports must use declared `package.json#exports`. Relative imports must stay inside one package.

Runtime folders must not import sibling runtime implementations. Cross-runtime reuse must use an exact package export or a concrete app-core owner. The only exception is `apps/extension/src/web-snapshot-viewer/preparation/**` importing `apps/extension/src/content/public/preparation-surface/**`.

## Owner folders

Name a folder for the behavior, contract, state authority, UI surface, effect boundary, or workflow it owns. Inside that folder, name files by role, such as `view`, `state`, `service`, `adapter`, `parser`, `guards`, or `test-support`.

Keep runtime-neutral Page Package composition under `apps/extension/src/workflows/page-package`. Keep its temporary OPFS sink under `apps/extension/src/composition/persistence/assets`. Keep capture, messaging, publication, retention, and download effects in their existing runtime or composition owners. Keep the hostile Page Package manifest parser in `@sniptale/runtime-contracts/page-package`.

Let content own the Page Package message archive sink. Let the background job own job, tab, ordinal, and staged-object identity. Apply the [transfer policy](../security/data-handling.md#import-and-export) to staging, validation, publication, and cleanup.

## Public surfaces

Package public surfaces are exact exports. App-core cross-runtime surfaces are explicit owner paths. Do not add root barrels, wildcard package exports, import-time effects outside init or service owners, or compatibility facades that hide ownership.

## Topology changes

Apply the split, consolidation, and proof rules in [implementation rules](../engineering/implementation-rules.md#code-shape). Tests stay beside their owner. Test support must remain owner-private.
