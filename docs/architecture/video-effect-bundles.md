# Animation packages and GL transitions

Sniptale accepts checked Lottie JSON, `.lottie` archives, animation JSON, and portable animation packs. The `animation-template` runtime contract owns source validation. The `effect-controls` contract owns editable metadata. Video, import, persistence, preview, export, and backup adapters retain their existing owners.

Reject executable imports, expressions, dynamic modules, remote dependencies, and unknown versions. Reject EffectV1 command documents and engine2 bundles. Preserve opaque historical catalogue rows without applying or rewriting them. Present projects with unsupported template data as unavailable items.

## Import

Parse JSON with the bounded structural parser before animation validation. Check archive paths, entry counts, sizes, compression ratios, collisions, and manifests before inflation. Reject encryption, symlinks, traversal, absolute paths, ambiguous separators, undeclared files, and executable MIME types.

Check local resource references, dimensions, frame intervals, controls, bindings, and object handles. Accept only the supported PNG, JPEG, WebP, TTF, and OTF resources. Check declared sizes, SHA-256 digests, and MIME signatures. Reject detached SVG and audio resources.

The portable exporter includes complete checked sources and their embedded resources. Catalogue preferences remain separate from package bytes. Recheck the resulting archive through the supported importer.

## Catalogue and projects

The `video_animation_packages` store contains source-only packages. Separate preferences reference immutable package and document identities. The `video_visual_preferences` store contains those preferences. The `video_gl_transition_presets` store contains checked GL selections. Commit related resources and preferences atomically.

Recheck source and resource hashes without changing stored bytes. Keep invalid stored rows visible through typed summaries. Prevent their application. A catalogue reimport or removal must not change applied project snapshots.

An annotation application creates or reuses a content-addressed snapshot. Its source contains every required resource. Annotation snapshots do not adopt detached project assets. Check retained bytes, references, controls, intrinsic dimensions, and host timing on project save and read.

The media-hub backup contract owns the archive version. Its owner is `apps/extension/src/workflows/media-hub-backup/v6/contracts.ts`. Restore checks paths, sizes, hashes, signatures, references, and the reconstructed project before publication. Privacy erasure includes authoritative catalogue and preference stores.

## Image filters and transitions

Source filters belong to VIDEO clips. Their checked stacks contain supported operations and parameters, without imported drawing code. Both composition backends use the same operation order and logical source dimensions.

Explicit visual joins contain checked GL selections. The bundled catalogue pins 214 shaders and their parameters. New visual joins use Fade. Audio joins retain their separate audio behavior. Presets contain selections and preferences, without executable shader imports.

## Runtime

The manifest sandbox and inline Worker render checked Lottie packages. Imported bytes never become scripts. The retired SDK is not a runtime dependency.

The parent resolves visibility, local time, controls, placement, and immutable package identity. Protocol version 7 binds source digest, resources, request identity, dimensions, and clock. The broker checks package hashes and resources before Worker execution. It refuses detached assets and source-frame inputs.

The Worker retains Lottie players and serializes their mutation. Successful requests return independently owned bitmaps. Worker replies cannot select the retired command or GPU-plan interpreter.

Both receiving boundaries check controls, intrinsic geometry, and animation duration. Physical raster dimensions remain separate from logical dimensions. Queue, deadline, package, raster, cache, and consecutive-failure limits remain active. Malformed, stale, late, and failed-transfer results release their resources. A timeout retires the Worker before queued execution resumes.

The parent compositor owns final placement, camera, masks, and composition. Transferred bitmaps remain alive until their GPU borrows finish. Preview can discard obsolete requests. Export must process each required frame. These execution policies do not change source interpretation.

The parent backend owns WebGPU availability and device failure. Its Canvas fallback does not admit unsupported animation packages. Validation and resource failures remain explicit.

Sandbox CSP permits local packaged WASM and data resources. It prohibits `unsafe-eval`, remote connections, and extension API authority. The tour sandbox retains its separate restrictions. Reject external Worker scripts and executable imported content.

## Change proof

For contract changes, update the source validator, importer, and affected fixtures. Prove supported JSON and archive imports with each changed refusal boundary. Include atomicity, quota, rollback, integrity, and backup restore when the change reaches those paths.

Check both editors, inspector previews, attachment planes, clocks, controls, Undo/Redo, cancellation, cleanup, and export for affected consumers. Check actual GPU completion and pixels when the scenario requires GPU composition. A bitmap receipt alone does not prove final composition.

For sandbox entry changes, check manifest, build topology, CSP, and artifact security. Do not add compatibility interpreters, executable assets, dynamic-code exceptions, or a second runtime for preview and export.

## Annotation attachment conversion

Attachment conversion first preserves an exactly representable rotated rectangle. Perspective or shear requires a local flatten. Project the body center. Retain the Jacobian's local X direction and axis lengths. Project each fixed anchor independently.

The target body loses projective deformation. The conversion does not promise four-corner equality or reversibility after two switches. Existing bounds still apply. Reject singular, behind-camera, and reflected geometry. One history transaction stores attachment, transform, and anchors. Undo/Redo restores the accepted state exactly, including timing, controls, and immutable identity.

## Generated validator tool-noise

`apps/extension/build/lottie-schema.ts` owns the pinned schema and compiled validator bytes. Formatting must preserve both artifacts. Two successful generator runs must produce the same validator bytes.

Three style rules have an exact `tool-noise` scope: `packages/runtime-contracts/src/animation-template/lottie-schema.generated.js`. Ajv reuses variable declarations and temporary values. The generator emits readable code. The production bundler owns minification. The rules are `no-redeclare`, `no-unused-vars`, and `no-useless-assignment`. Security and dynamic-code checks remain active. Remove this scope when the generator no longer emits these constructs or you remove the validator.
