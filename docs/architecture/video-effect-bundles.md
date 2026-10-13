# EffectV1 bundles

Sniptale accepts `sniptale.effect.v1` JSON and `sniptale.bundle.engine2` ZIP archives. `@sniptale/runtime-contracts/effect-v1` owns the schema and producer fixtures. Extension import, persistence, project, preview, export, and backup adapters stay under their named video and persistence owners.

Reject executable effects, imported source, dynamic modules, remote dependencies, unknown schema versions, and engine1 or legacy template-pack compatibility. Present stored projects with `templateInstances` as unsupported items.

## Import

Parse raw JSON with the bounded structural parser and EffectV1 validator. Before ZIP inflation, check the central directory, normalized paths, entry count, entry and total sizes, compression ratios, collisions, and manifest. Reject encryption, symlinks, traversal, absolute paths, ambiguous separators, undeclared files, and executable MIME types.

Check allowed keys, graph closure, kinds, inputs, references, observability, bounds, and target compatibility. Accept only SDK-approved image, SVG, and audio assets. Check declared sizes, SHA-256 digests, and MIME signatures.

Lock the SDK corpus version and contract commit in extension tests. Replace the complete fixture set, expectations, evidence, lock, and digests together.

## Catalog and projects

Store one materialized record per catalog pack. Commit metadata, checked source, and assets atomically. Recheck source and asset hashes on read without fixes. Keep invalid rows visible as typed invalid summaries. Prevent their application.

An effect application creates or reuses an immutable content-addressed project snapshot. The snapshot contains the checked source and referenced assets. A catalog pack reimport or removal must not change existing projects. Check source, assets, retained-byte accounting, references, and target compatibility on project save and read.

`MEDIA_HUB_BACKUP_VERSION` in `apps/extension/src/workflows/media-hub-backup/v6/contracts.ts` owns the media-hub backup version. The current format stores snapshot blobs as bounded archive entries. Restore checks paths, sizes, hashes, signatures, closure, and the reconstructed project before one IndexedDB write. Privacy erasure removes the catalog with other authoritative stores.

## Runtime

Preview and export share frame and audio plans. Before sandbox evaluation, resolve instance time, target visibility, transitions, and target-effect ordering.

The manifest sandbox and inline Worker interpret only the EffectV1 vocabulary. Never convert imported bytes to script. Bind protocol version, request and sequence, snapshot and document identity, dimensions, time, controls, assets, and input frames. Enforce queue, timeout, canvas, raster, SVG, decoded-media, and failure budgets in both broker and Worker. Fail without a renderer fallback.

Use the shared audio plan for preview, MP4, and WebM. Apply ordinary host-clip visibility and interval rules to standalone effect audio. Preview owns a disposable Web Audio graph with stale-decode protection and cleanup. Check decoded PCM limits after browser decode.

Keep sandbox CSP free of `unsafe-eval`. Reject `Function`, `eval`, external Worker scripts, and dynamic code in source and artifacts.

## Change proof

For contract changes, update the schema, validator, importer, and locked corpus. Prove admitted JSON and ZIP imports plus each changed rejection boundary. Include catalog atomicity, quota, rollback, project integrity, and backup restore when the changed behavior reaches those paths. Include effect kinds, chaining, timing, audio, preview/export parity, and cleanup when the changed behavior reaches those paths.

For sandbox entry changes, update manifest and build topology, CSP, and artifact-security proof. Do not add compatibility, executable assets, dynamic-code exceptions, or a second preview or export runtime.

## Annotation attachment conversion

Attachment changes first preserve an exactly representable rotated rectangle. Perspective or shear uses a local flatten. For that flatten, project the body center. Retain the Jacobian's local X direction and axis lengths. Project each fixed anchor independently.

The target body loses projective deformation. The conversion does not promise four-corner equality or two-switch reversibility. Existing bounds and rejection of singular, behind-camera or reflected geometry still apply. One existing history transaction stores attachment, transform and anchors. Undo/Redo restores the full accepted state exactly without changes to timing, controls or immutable effect identity.
