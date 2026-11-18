import { EFFECT_V1_INTEGRATION_OWNER_MAPPINGS } from './effect-v1-integration.mjs';

export const EFFECT_V1_OWNER_MAPPINGS = [
  {
    owner: 'composition-frame-gl-cursor',
    productionFile: 'apps/extension/src/features/video/composition/timeline/frame/index.ts',
    allowCrossOwner: true,
    reason: 'Frame assembly retains explicit GL weights, cursor clocks and source-window geometry.',
    testFiles: [
      'apps/extension/src/features/video/composition/timeline/frame.test.ts',
      'apps/extension/src/features/video/composition/timeline/render.test.ts',
      'apps/extension/src/features/video/composition/motion/source-window.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'source-filter-review-state',
    productionFile: 'apps/extension/src/features/video/review/advanced/types.ts',
    reason:
      'Version30 admits checked source-filter stacks and retains existing state migration and immutable projection.',
    testFiles: [
      'apps/extension/src/features/video/review/advanced/advanced-state.test.ts',
      'apps/extension/src/features/video/review/advanced/advanced.test.ts',
      'apps/extension/src/features/video/review/advanced/migration.test.ts',
      'apps/extension/src/features/video/review/advanced/effective.test.ts',
      'apps/extension/src/features/video/review/project-conversion.scene.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'source-filter-review-state',
    productionFile: 'apps/extension/src/features/video/review/advanced/validation.ts',
    reason:
      'Version30 admits checked source-filter stacks and retains existing state migration and immutable projection.',
    testFiles: [
      'apps/extension/src/features/video/review/advanced/advanced-state.test.ts',
      'apps/extension/src/features/video/review/advanced/advanced.test.ts',
      'apps/extension/src/features/video/review/advanced/migration.test.ts',
      'apps/extension/src/features/video/review/advanced/effective.test.ts',
      'apps/extension/src/features/video/review/project-conversion.scene.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'source-filter-zoom-preview-preparation',
    productionFile: 'apps/extension/src/gallery/video-review/zoom-preview-camera.ts',
    reason:
      'Prepared camera forwards source filters to the existing Canvas/GPU inspector paths without stale revisions.',
    testFiles: [
      'apps/extension/src/gallery/video-review/zoom-preview-preparation.test.tsx',
      'apps/extension/src/gallery/video-review/zoom-preview-canvas.test.tsx',
      'apps/extension/src/gallery/video-review/zoom-preview-gpu.test.ts',
      'apps/extension/src/gallery/video-review/zoom-preview-paint.test.ts',
      'apps/extension/src/gallery/video-review/zoom-preview-follow.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'source-filter-review-project-scene',
    productionFile: 'apps/extension/src/features/video/review/project-scene.ts',
    reason:
      'Scene projection retains immutable per-source filters through Gallery to Native conversion.',
    testFiles: [
      'apps/extension/src/features/video/review/project-conversion.scene.test.ts',
      'apps/extension/src/features/video/review/project-conversion.appearance.test.ts',
      'apps/extension/src/features/video/review/project-conversion.test.ts',
    ],
  },
  {
    owner: 'source-image-filter-canvas-adapter',
    productionFile: 'apps/extension/src/features/video/composition/canvas/source-image-filter.ts',
    allowCrossOwner: true,
    reason: 'Canvas fallback checks pixels and owns temporary raster and working reservations.',
    testFiles: [
      'apps/extension/src/features/video/composition/canvas/source-image-filter.test.ts',
      'apps/extension/src/features/video/composition/export-enhancement/prepared-source.test.ts',
    ],
  },
  {
    owner: 'source-image-filter-prepared-source',
    productionFile:
      'apps/extension/src/features/video/composition/export-enhancement/prepared-source.ts',
    allowCrossOwner: true,
    reason: 'Prepared sources retain filter identity and resource ownership in both editors.',
    testFiles: [
      'apps/extension/src/features/video/composition/export-enhancement/prepared-source.test.ts',
      'apps/extension/src/workflows/video-review/export-source-sampling.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/source-sampling.test.ts',
      'apps/extension/src/workflows/video/native-composition/gpu-preview-layers.test.ts',
    ],
  },
  {
    owner: 'source-image-filter-fields',
    productionFile: 'apps/extension/src/ui/source-image-filter-fields.tsx',
    allowCrossOwner: true,
    reason: 'Controlled filter fields preserve each editor command and history owner.',
    testFiles: [
      'apps/extension/src/ui/source-image-filter-fields.test.tsx',
      'apps/extension/src/gallery/video-review/advanced-panels.test.tsx',
      'apps/extension/src/gallery/video-review/use-advanced.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/source-filters.test.tsx',
      'apps/extension/src/video-editor/project/state/clip-property/source-filters.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'source-image-filter-core',
    productionPrefix: 'apps/extension/src/features/image-filters/',
    allowCrossOwner: true,
    reason: 'Source filters have strict contracts, independent CPU pixels and GPU lifetime proof.',
    testFiles: [
      'apps/extension/src/features/image-filters/contract.test.ts',
      'apps/extension/src/features/image-filters/plan.test.ts',
      'apps/extension/src/features/image-filters/reference.test.ts',
      'apps/extension/src/features/image-filters/gpu.test.ts',
      'apps/extension/src/features/video/composition/canvas/gpu-preview-plan.test.ts',
      'apps/extension/src/features/video/composition/canvas/gpu-preview-css-filter.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'gl-transition-preset-file-actions',
    productionPrefix: 'apps/extension/src/composition/gl-transition-presets/',
    allowCrossOwner: true,
    reason:
      'Bounded preset file lifecycle and all five existing command/Undo adapters have direct proof.',
    testFiles: [
      'apps/extension/src/composition/gl-transition-presets/actions.test.tsx',
      'apps/extension/src/composition/gl-transition-presets/catalog.test.tsx',
      'apps/extension/src/ui/gl-transition-choices.test.ts',
      'apps/extension/src/settings/sections/styles/video-effects/gl-catalog.test.tsx',
      'apps/extension/src/gallery/video-review/selected-properties.test.tsx',
      'apps/extension/src/gallery/video-review/presentation-inspector.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/effect-controls/panels/transition-panel.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inspection/scene-joins.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inspection/scene-bookend-preset.test.tsx',
    ],
  },
  {
    owner: 'gl-transition-field-slots',
    productionFile: 'apps/extension/src/ui/gl-transition-fields.tsx',
    allowCrossOwner: true,
    reason: 'Pure field action slot retains controlled parameters and has no file IO authority.',
    testFiles: [
      'apps/extension/src/ui/gl-transition-fields.test.tsx',
      'apps/extension/src/composition/gl-transition-presets/actions.test.tsx',
    ],
  },
  {
    owner: 'gl-presentation-join-field-slots',
    productionFile: 'apps/extension/src/ui/presentation-join-fields.tsx',
    reason: 'Presentation join forwards the GL action slot without changing timing or easing.',
    testFiles: [
      'apps/extension/src/ui/presentation-join-fields.test.tsx',
      'apps/extension/src/ui/gl-transition-choices.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-zip-profile',
    productionPrefix: 'packages/platform/src/data/zip-profile/',
    reason:
      'The bounded central-directory parser has direct collision, ZIP64, range, and local-header proof.',
    testFiles: ['packages/platform/src/data/zip-profile/central-directory.test.ts'],
  },
  {
    allowCrossOwner: true,
    exclusive: true,
    owner: 'effect-v1-runtime-contract',
    productionPrefix: 'apps/extension/src/contracts/effect-runtime/',
    reason:
      'Sandbox identity, bitmap lifetime, vector, and result contracts are exercised ' +
      'at both protocol boundaries.',
    testFiles: [
      'apps/extension/src/effect-runtime-sandbox/broker/request-boundary.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/worker-request.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/execute.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'animation-import-boundary',
    productionPrefix: 'apps/extension/src/features/video/project/effect-bundle/',
    reason:
      'Bounded Lottie JSON and ZIP imports verify source integrity and disposable Worker authority.',
    testFiles: [
      'apps/extension/src/features/video/project/effect-bundle/boundary.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/boundaries.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/worker/boundary.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/index.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/lottie-profile.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/zip/archive.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/catalog/export.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-project-runtime',
    productionPrefix: 'apps/extension/src/features/video/composition/effect-runtime/',
    reason: 'EffectV1 frame, audio, media, and resource plans are covered by owner-local suites.',
    testFiles: [
      'apps/extension/src/features/video/composition/effect-runtime/audio/plan.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/render/composition-coverage.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/runtime/driver.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/runtime/gpu-driver.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/frame/inputs.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/frame/plan.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/media/decode.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/media/raster-header.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/render/wave.test.ts',
      'apps/extension/src/features/video/composition/effect-runtime/runtime/resource-limits.test.ts',
    ],
  },
  {
    owner: 'effect-v1-composition-draw',
    productionFile: 'apps/extension/src/features/video/composition/draw/effect-runtime.ts',
    reason: 'EffectV1 standalone, target, transition, and scene draw paths have direct proof.',
    testFiles: ['apps/extension/src/features/video/composition/draw/effect-runtime.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-project-snapshots',
    allowCrossOwner: true,
    productionPrefix: 'apps/extension/src/features/video/project/effect-instance/',
    reason:
      'Receiving sandbox checks snapshots/timing/targets; local suites prove apply, integrity and quota refusal.',
    testFiles: [
      'apps/extension/src/features/video/project/effect-bundle/retained-presentation.test.ts',
      'apps/extension/src/features/video/project/effect-instance/layout.test.ts',
      'apps/extension/src/features/video/project/effect-instance/owner.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/frame-producers.test.ts',
      'apps/extension/src/features/video/project/effect-instance/apply-boundaries.test.ts',
      'apps/extension/src/features/video/project/effect-instance/apply-targets.test.ts',
      'apps/extension/src/features/video/project/effect-instance/apply.test.ts',
      'apps/extension/src/features/video/project/effect-instance/integrity.test.ts',
    ],
  },
  {
    owner: 'effect-v1-project-validation',
    productionFile: 'apps/extension/src/features/video/project/validation/effect-instances.ts',
    reason:
      'Animation branch structure, quota, identity and canonical provenance save/reopen have direct proof.',
    allowCrossOwner: true,
    testFiles: [
      'apps/extension/src/features/video/project/validation/effect-instances.test.ts',
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
    ],
  },
  {
    owner: 'effect-v1-editor-runtime-facade',
    productionFile: 'apps/extension/src/video-editor/runtime/effect-runtime/index.ts',
    reason:
      'The editor facade is exercised through the shared frame driver and preview runtime suites.',
    testFiles: [
      'apps/extension/src/features/video/composition/effect-runtime/runtime/driver.test.ts',
      'apps/extension/src/video-editor/preview/stage/runtime/index.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-offscreen-export',
    productionPrefix: 'apps/extension/src/offscreen/project-export/effect-runtime/',
    reason:
      'The export runtime lazy lifecycle, plan gate, owner document, and disposal have direct proof.',
    testFiles: ['apps/extension/src/offscreen/project-export/effect-runtime/index.test.ts'],
  },
  {
    owner: 'effect-v1-offscreen-frame-draw',
    productionFile: 'apps/extension/src/offscreen/project-export/renderer/frame-effects.ts',
    reason:
      'Export effect draw state and renderer integration are covered by focused frame suites.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/renderer/frame-effects.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/frame.effect-options.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/frame.test.ts',
    ],
  },
  {
    owner: 'effect-v1-editor-instance-actions',
    productionFile: 'apps/extension/src/video-editor/project/state/effects.effect-instance.ts',
    reason:
      'Apply authority, stale-result rejection, CRUD, target ordering, and control merging have direct proof.',
    testFiles: ['apps/extension/src/video-editor/project/state/effects.effect-instance.test.ts'],
  },
  {
    owner: 'effect-v1-editor-clip-shifts',
    productionFile: 'apps/extension/src/video-editor/project/state/clip-timeline/clip-shifts.ts',
    reason: 'Clip-target EffectV1 timing follows exact clamped clip movement with direct proof.',
    testFiles: ['apps/extension/src/video-editor/project/state/clip-timeline/clip-shifts.test.ts'],
  },
  {
    owner: 'effect-v1-standalone-clip-host',
    productionFile: 'apps/extension/src/video-editor/project/state/clip-timeline/effect-host.ts',
    reason:
      'Standalone host lookup, duplication, split timing, and rejection paths have direct lifecycle proof.',
    testFiles: ['apps/extension/src/video-editor/project/state/effects.effect-instance.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-workflow-executor',
    productionPrefix: 'apps/extension/src/workflows/video/effect-runtime-sandbox',
    reason:
      'The parent executor session, request lifecycle, timeout, and disposal have direct proof.',
    testFiles: ['apps/extension/src/workflows/video/effect-runtime-sandbox.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-timeline-visibility',
    productionPrefix: 'apps/extension/src/video-editor/timeline/project/effect-lanes/',
    reason:
      'Effect lane rendering, snapping, actions, and visibility are exercised by timeline and project suites.',
    testFiles: [
      'apps/extension/src/video-editor/timeline/project/canvas/index.test.tsx',
      'apps/extension/src/video-editor/project/state/effects.test.ts',
    ],
  },
  {
    owner: 'effect-v1-inspector-groups',
    productionFile:
      'apps/extension/src/video-editor/workspace/sidebar/selection/effect-instance/groups.tsx',
    reason:
      'Effect inspector groups are exercised by the effects dock and workspace controller suites.',
    testFiles: [
      'apps/extension/src/video-editor/library/effects-dock/index.test.tsx',
      'apps/extension/src/video-editor/runtime/controller/workspace-state.test.tsx',
    ],
  },
  {
    owner: 'effect-v1-composition-contract',
    productionFile: 'apps/extension/src/features/video/composition/types.ts',
    reason: 'EffectV1 composition plan fields are exercised by frame planning and draw suites.',
    testFiles: [
      'apps/extension/src/features/video/composition/effect-runtime/frame/plan.test.ts',
      'apps/extension/src/features/video/composition/draw/transition.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'video-object-track-model',
    productionPrefix: 'apps/extension/src/features/video/project/object-tracks/',
    reason: 'The extracted object-track model is covered by normalization and fail-closed tests.',
    testFiles: ['apps/extension/src/features/video/project/object-tracks/sampling.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-sandbox-runtime',
    allowCrossOwner: true,
    productionPrefix: 'apps/extension/src/effect-runtime-sandbox/',
    reason:
      'The checked animation protocol, broker boundary, Lottie execution and resource lifecycle have direct proof.',
    testFiles: [
      'apps/extension/src/effect-runtime-sandbox/broker/worker-message-boundary.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/lottie.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/cache/documents.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/cache/asset-selections.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/cache/models.test.ts',
      'apps/extension/src/contracts/effect-runtime/animation.test.ts',
      'apps/extension/src/effect-runtime-sandbox/policy/guards.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/prepare-frame.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/worker-request.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/request-boundary.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/runtime.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/session.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/index-entry.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/execute.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/index.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/protocol/request.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/lottie.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'visual-catalog-persistence',
    productionPrefix: 'apps/extension/src/composition/persistence/effect-bundles/',
    reason:
      'Atomic source-only writes, bounded preferences, legacy refusal and resource integrity have direct proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/effect-bundles/catalog-builder.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/index.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/settings-transfer.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/gl-presets.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/import-files.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/presets.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/builtin.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/integrity.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/preferences.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'visual-catalog-settings',
    productionPrefix: 'apps/extension/src/settings/sections/styles/video-effects/',
    allowCrossOwner: true,
    reason: 'Settings collection lifecycle and Lottie/GL actions have mounted consumer proof.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/video-effects/gl-catalog.test.tsx',
      'apps/extension/src/settings/sections/styles/video-effects/index.test.tsx',
      'apps/extension/src/settings/sections/styles/video-effects/slot-mapping-model.test.ts',
      'apps/extension/src/settings/sections/styles/video-effects/slot-mapping-dialog.test.tsx',
      'apps/extension/src/settings/sections/styles/video-effects/availability.test.tsx',
      'apps/extension/src/composition/gl-transition-presets/catalog.test.tsx',
    ],
  },
  {
    owner: 'gl-transition-choice-projection',
    productionFile: 'apps/extension/src/ui/gl-transition-choices.ts',
    reason:
      'Pure catalogue projection preserves pinned selections and refuses unavailable new choices.',
    testFiles: ['apps/extension/src/ui/gl-transition-choices.test.ts'],
  },
  {
    owner: 'gl-transition-labels',
    productionFile: 'apps/extension/src/ui/gl-transition-labels.ts',
    reason: 'Localized built-in labels and literal imported names have direct catalog proof.',
    testFiles: [
      'apps/extension/src/ui/gl-transition-choices.test.ts',
      'apps/extension/src/ui/gl-transition-fields.test.tsx',
    ],
  },
  ...EFFECT_V1_INTEGRATION_OWNER_MAPPINGS,
];
