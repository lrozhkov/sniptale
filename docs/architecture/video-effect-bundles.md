# EffectV1 bundles

Sniptale accepts declarative `sniptale.effect.v1` documents as raw JSON or inside `sniptale.bundle.engine2` ZIP archives. The SDK schema and producer proof define the external authoring contract; extension-owned import, persistence, project, preview, export, and backup adapters live under `apps/extension/src/features/video/project/effect-bundle`, `apps/extension/src/composition/persistence/effect-bundles`, and `apps/extension/src/features/video/composition/effect-runtime`.

There is no executable effect format and no engine1 compatibility path. Imported JavaScript, renderer source, dynamic modules, remote dependencies, unknown schema versions, and legacy template-pack projects are rejected. A stored project that still contains `templateInstances` remains visible only as a typed unsupported item so users are not misled into opening or backing up data that the current runtime cannot execute.

## Import boundary

Raw JSON is parsed with the same bounded structural parser and EffectV1 validator used for bundle documents. ZIP import first validates the central directory, normalized local paths, entry count, per-entry size, total inflated size, compression ratios, duplicate/colliding names, and manifest shape before inflating selected entries. Symlinks, encryption, traversal, absolute paths, ambiguous separators, undeclared files, and executable MIME types fail closed.

Every document must pass the canonical EffectV1 schema and semantic validator, including kind/input compatibility, declared layer/clip/asset references, graph command and expression closure, phase/track/control observability, scene/timeline bounds, and exact allowed keys. Assets are restricted to image, SVG, and audio types accepted by the SDK contract. Declared byte lengths and SHA-256 digests must match imported bytes, and file signatures must match the declared MIME type.

The SDK handoff corpus version and contract commit are locked in extension tests. Updating the corpus requires replacing the complete authoritative fixture set and its expectations, evidence, contract lock, and digests together; ad hoc fixture drift is not accepted.

## Catalog and project authority

The IndexedDB effect catalog stores one materialized record per pack. A write is atomic across the pack metadata, validated document sources, and retained asset blobs. Reads revalidate source and asset hashes without write-on-read repair. Invalid rows remain visible as typed invalid summaries and cannot be applied.

Applying a catalog document creates or reuses a content-addressed project snapshot. The snapshot contains the exact validated document source and all referenced asset blobs; an effect instance points only to that immutable snapshot and an explicit scene, clip, or transition target. Reimporting or deleting a catalog pack cannot mutate an existing project. Project saves and reads verify document and asset hashes, MIME signatures, retained-byte accounting, references, and kind/target compatibility.

Projects with EffectV1 snapshots use media-hub backup format version 4. Snapshot blobs are extracted into bounded archive entries instead of being serialized as JSON objects. Restore verifies paths, sizes, hashes, signatures, document closure, and the complete reconstructed project before the atomic IndexedDB write. Local-data erasure clears the catalog together with every other authoritative IndexedDB store.

## Runtime boundary

Preview and export share one pure frame-plan and audio-plan model. Instance time is `(projectTime - startTime) * playbackRate`; target visibility and transition timing are resolved before a request reaches the sandbox. Visual inputs are materialized by the owning host adapter, and target-effect chains preserve deterministic order.

The manifest sandbox and its build-owned inline Worker interpret only the closed EffectV1 graph vocabulary. Imported bytes never become script text. The protocol binds version, request identity, sequence, snapshot identity, document digest, dimensions, frame time, controls, assets, and input frames. The broker and Worker both enforce queue, timeout, canvas, raster, SVG, decoded-media, and failure budgets. Any mismatch or unsupported operation produces a typed failure; preview and export do not fall back to a different renderer.

Effect audio is planned from visible enabled audio layers and clips using the same instance timing and playback-rate mapping in preview and export. Standalone audio follows the same ordinary host-clip visibility and interval authority as its visual frame. Preview owns a disposable Web Audio graph with stale-decode protection and cleanup. MP4 and WebM both consume the shared offline mix, so neither export format owns a parallel EffectV1 audio path. Decoded PCM is checked after browser decode for channel, sample-rate, frame, and byte limits.

The sandbox CSP does not grant `unsafe-eval`. Source and artifact guards reject direct and aliased `Function` constructors, `eval`, external Worker scripts, and dynamic code in the sandbox as well as extension pages.

## Change checklist

- Keep the runtime-contract schema, semantic validator, extension importer, and locked SDK corpus synchronized.
- Preserve one transactional catalog authority and immutable content-addressed project snapshots.
- Prove raw JSON and ZIP success, every bounded failure family, storage rollback/quota behavior, project save/read/backup integrity, all three effect kinds, target chaining, transition timing, audio parity, preview/export parity, and cleanup.
- Update manifest/build topology, CSP and artifact-security proof together when the sandbox entry changes.
- Do not add a compatibility adapter, executable asset kind, dynamic-code exception, or alternate preview/export runtime.
