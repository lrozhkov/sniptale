# EffectV1 bundles

Sniptale accepts `sniptale.effect.v1` JSON and `sniptale.bundle.engine2` ZIP archives. `@sniptale/runtime-contracts/effect-v1` owns the schema and producer fixtures. Extension import, persistence, project, preview, export, and backup adapters stay under their named video and persistence owners.

Reject executable effects, imported source, dynamic modules, remote dependencies, unknown schema versions, and engine1 or legacy template-pack compatibility. Present stored projects with `templateInstances` as unsupported items.

## Import

Parse raw JSON with the bounded structural parser and EffectV1 validator. Before ZIP inflation, validate the central directory, normalized paths, entry count, entry and total sizes, compression ratios, collisions, and manifest. Reject encryption, symlinks, traversal, absolute paths, ambiguous separators, undeclared files, and executable MIME types.

Validate allowed keys, graph closure, kinds, inputs, references, observability, bounds, and target compatibility. Accept only SDK-approved image, SVG, and audio assets. Verify declared sizes, SHA-256 digests, and MIME signatures.

Lock the SDK corpus version and contract commit in extension tests. Replace the complete fixture set, expectations, evidence, lock, and digests together.

## Catalog and projects

Store one materialized record per catalog pack. Commit metadata, validated source, and assets atomically. Revalidate source and asset hashes on read without repair. Keep invalid rows visible as typed invalid summaries and prevent application.

Applying an effect creates or reuses an immutable content-addressed project snapshot containing the validated source and referenced assets. Reimporting or deleting a catalog pack must not change existing projects. Validate source, assets, retained-byte accounting, references, and target compatibility on project save and read.

`MEDIA_HUB_BACKUP_VERSION` in `apps/extension/src/workflows/media-hub-backup/v6/contracts.ts` owns the media-hub backup version. The current format stores snapshot blobs as bounded archive entries. Restore validates paths, sizes, hashes, signatures, closure, and the reconstructed project before one IndexedDB write. Privacy erasure removes the catalog with other authoritative stores.

## Runtime

Preview and export share frame and audio plans. Resolve instance time, target visibility, transitions, and target-effect ordering before sandbox evaluation.

The manifest sandbox and inline Worker interpret only the EffectV1 vocabulary. Never convert imported bytes to script. Bind protocol version, request and sequence, snapshot and document identity, dimensions, time, controls, assets, and input frames. Enforce queue, timeout, canvas, raster, SVG, decoded-media, and failure budgets in both broker and Worker. Fail without a renderer fallback.

Use the shared audio plan for preview, MP4, and WebM. Apply ordinary host-clip visibility and interval rules to standalone effect audio. Preview owns a disposable Web Audio graph with stale-decode protection and cleanup. Validate decoded PCM limits after browser decode.

Keep sandbox CSP free of `unsafe-eval`. Reject `Function`, `eval`, external Worker scripts, and dynamic code in source and artifacts.

## Change proof

For contract changes, update the schema, validator, importer, and locked corpus. Prove admitted JSON and ZIP imports plus each changed rejection boundary. Include catalog atomicity, quota and rollback, project integrity, backup restore, effect kinds, chaining, timing, audio, preview and export parity, and cleanup when the changed behavior reaches those paths.

For sandbox entry changes, update manifest and build topology, CSP, and artifact-security proof. Do not add compatibility, executable assets, dynamic-code exceptions, or a second preview or export runtime.
