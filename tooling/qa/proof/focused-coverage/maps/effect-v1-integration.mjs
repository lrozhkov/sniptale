export const EFFECT_V1_INTEGRATION_OWNER_MAPPINGS = [
  {
    exclusive: true,
    owner: 'effect-v1-editor-drag-contract',
    productionFile: 'apps/extension/src/video-editor/contracts/effect-document-drag.ts',
    reason: 'EffectV1 document drag payloads have an exact boundary round-trip suite.',
    testFiles: ['apps/extension/src/video-editor/contracts/effect-document-drag.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-v6-inventory',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/v6/inventory/effect-bundles.ts',
    reason:
      'Source-only visual archive inventory has exact source, preference and atomic snapshot proof.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/inventory/effect-bundles.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-v6-codec',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/v6/root-codecs/effect-bundle.ts',
    reason: 'EffectV1 portable metadata parsing has direct strict codec proof.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/root-codecs/effect-bundle.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-v6-publication',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/effect-bundle.ts',
    reason:
      'Source-only resources, separate preferences and publication receipt share one native transaction.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/effect-bundle.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-project-hydration',
    productionFile: 'apps/extension/src/features/video/project/hydration/index.ts',
    reason: 'EffectV1 snapshot and instance hydration defaults and preservation have direct proof.',
    testFiles: ['apps/extension/src/features/video/project/hydration/effect-instances.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-project-duration-reconciliation',
    productionFile: 'apps/extension/src/features/video/project/timeline/basics.ts',
    reason:
      'Direct timeline suites prove predicates, linked clips, transitions, duration and EffectV1 reconciliation.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/basics.test.ts',
      'apps/extension/src/features/video/project/timeline/basics.predicates.test.ts',
      'apps/extension/src/features/video/project/timeline/basics.transitions.test.ts',
      'apps/extension/src/features/video/project/timeline/basics.waveforms.test.ts',
      'apps/extension/src/features/video/project/effect-instance/reconcile.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-project-meta',
    productionFile: 'apps/extension/src/features/video/project/timeline/meta.ts',
    reason: 'The relocated project metadata owner has direct default and metadata proof.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/project-meta.defaults.test.ts',
      'apps/extension/src/features/video/project/timeline/project-meta.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-layer-camera-lock',
    productionFile: 'apps/extension/src/features/video/composition/motion/layer-camera.ts',
    reason: 'Effect host layers follow the same viewport-lock authority with direct layer proof.',
    testFiles: ['apps/extension/src/features/video/composition/motion/layer-camera.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-legacy-media-sync',
    productionFile: 'apps/extension/src/composition/persistence/media-library/index.legacy-sync.ts',
    reason:
      'Legacy media synchronization consumes only typed ready projects and is covered by its ' +
      'library integration suite.',
    testFiles: ['apps/extension/src/composition/persistence/media-library/index.library.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-native-overlay-draw',
    productionFile: 'apps/extension/src/features/video/composition/draw/overlays.ts',
    reason: 'Native text overlay drawing no longer consumes engine1 animation state.',
    testFiles: ['apps/extension/src/features/video/composition/draw/overlays.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-visual-layer-draw',
    productionFile: 'apps/extension/src/features/video/composition/draw/visual.ts',
    reason:
      'Visual composition dispatch and EffectV1 bitmap drawing have direct visual and effect-runtime proof.',
    testFiles: [
      'apps/extension/src/features/video/composition/draw/effect-runtime.test.ts',
      'apps/extension/src/features/video/composition/draw/visual.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-preview-runtime',
    productionPrefix: 'apps/extension/src/video-editor/preview/stage/runtime/',
    reason:
      'Preview media, EffectV1 audio ownership, retry recovery, cleanup, drift, and ' +
      'playback rate have direct runtime proof.',
    testFiles: [
      'apps/extension/src/video-editor/preview/stage/runtime/effect-audio.test.ts',
      'apps/extension/src/video-editor/preview/stage/runtime/index.test.tsx',
      'apps/extension/src/video-editor/preview/stage/runtime/audio.test.tsx',
      'apps/extension/src/video-editor/preview/stage/runtime/audio-cleanup.test.tsx',
      'apps/extension/src/video-editor/preview/stage/runtime/audio-drift.test.tsx',
      'apps/extension/src/video-editor/preview/stage/runtime/playback-rate.test.tsx',
    ],
  },
  {
    exclusive: true,
    allowCrossOwner: true,
    owner: 'effect-v1-preview-scene',
    productionPrefix: 'apps/extension/src/video-editor/preview/stage/scene/',
    reason:
      'EffectV1 scene scheduling, geometry, locked layers, scaling, visual passes, and ' +
      'failure propagation have direct proof.',
    testFiles: [
      'apps/extension/src/video-editor/preview/stage/scene/geometry.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/index.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/locked-overlays.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/overlay-scale.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/render.test.tsx',
      'apps/extension/src/workflows/video/native-composition/render-visual.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/render-preview.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/render-scheduler.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/locked-overlays-motion-blur.test.tsx',
    ],
  },

  {
    exclusive: true,
    allowCrossOwner: true,
    owner: 'effect-v1-native-composition',
    productionPrefix: 'apps/extension/src/workflows/video/native-composition/',
    reason:
      'EffectV1 scene scheduling, geometry, locked layers, scaling, visual passes, and ' +
      'failure propagation have direct proof.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/shared-composition.test.ts',
      'apps/extension/src/video-editor/export/estimate-size.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer-gpu-joins.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer-gpu.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer-source.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer.images.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer.videos.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/geometry.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/index.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/locked-overlays-motion-blur.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/locked-overlays.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/overlay-scale.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/render-preview.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/render-scheduler.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/render.test.tsx',
      'apps/extension/src/workflows/video/native-composition/canvas.test.tsx',
      'apps/extension/src/workflows/video/native-composition/effect-preparation.test.ts',
      'apps/extension/src/workflows/video/native-composition/frame-plan.sources.test.ts',
      'apps/extension/src/workflows/video/native-composition/frame-plan.test.ts',
      'apps/extension/src/workflows/video/native-composition/gpu-preview-layers.test.ts',
      'apps/extension/src/workflows/video/native-composition/gpu-preview-materials.test.ts',
      'apps/extension/src/workflows/video/native-composition/gpu-preview.sources.test.ts',
      'apps/extension/src/workflows/video/native-composition/gpu-preview.test.ts',
      'apps/extension/src/workflows/video/native-composition/image-resources.test.ts',
      'apps/extension/src/workflows/video/native-composition/materializer-gpu-outputs.test.ts',
      'apps/extension/src/workflows/video/native-composition/render-visual.test.tsx',
      'apps/extension/src/workflows/video/native-composition/source-frames.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-preview-runtime-error',
    productionFile: 'apps/extension/src/video-editor/preview/stage/canvas/runtime-error.tsx',
    reason: 'The visible EffectV1 preview failure and explicit retry surface have direct UI proof.',
    testFiles: ['apps/extension/src/video-editor/preview/stage/canvas/runtime-error.test.tsx'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-offline-audio',
    productionPrefix: 'apps/extension/src/offscreen/project-export/offline-audio/',
    reason:
      'EffectV1 offline collection, bounded decode cache, scheduling, execution, ' +
      'cancellation, and cleanup have direct export proof.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/offline-audio/index.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/clip-audio/decode.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/schedule.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/render/orchestrate/index.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/render/orchestrate/render-loop.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/render/orchestrate/render-loop/execute.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/render/orchestrate/render-loop/run.test.ts',
    ],
  },
  {
    owner: 'effect-v1-project-persistence-contracts',
    productionFile: 'apps/extension/src/composition/persistence/projects/contracts.ts',
    reason: 'EffectV1 project persistence contracts have exact read and write proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
      'apps/extension/src/composition/persistence/projects/index.test.ts',
    ],
  },
  {
    owner: 'effect-v1-project-persistence-exports',
    productionFile: 'apps/extension/src/composition/persistence/projects/index.exports.ts',
    reason: 'The EffectV1 persistence facade export set has exact contract proof.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.exports.test.ts'],
  },
  {
    owner: 'effect-v1-project-persistence-mutations',
    productionFile: 'apps/extension/src/composition/persistence/projects/index-mutations.ts',
    reason: 'EffectV1 persistence mutations have exact save and stale-write proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
      'apps/extension/src/composition/persistence/projects/index.stale-save.test.ts',
      'apps/extension/src/composition/persistence/projects/index.test.ts',
    ],
  },
  {
    owner: 'effect-v1-project-persistence-facade',
    productionFile: 'apps/extension/src/composition/persistence/projects/index.ts',
    reason: 'EffectV1 ready/read/write facade behavior has exact persistence proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
      'apps/extension/src/composition/persistence/projects/index.stale-save.test.ts',
      'apps/extension/src/composition/persistence/projects/index.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-editor-autosave-read-contract',
    productionFile: 'apps/extension/src/video-editor/runtime/session/auto-save.ts',
    reason:
      'Autosave stale-rebase behavior uses the exact persisted project read contract with direct proof.',
    testFiles: ['apps/extension/src/video-editor/runtime/session/auto-save.test.tsx'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-editor-project-state',
    productionFile: 'apps/extension/src/video-editor/project/state/effects.ts',
    reason:
      'EffectV1, captured actions, camera phases, spatial edits and borders share the current project command owner.',
    testFiles: [
      'apps/extension/src/video-editor/project/state/effects.test.ts',
      'apps/extension/src/video-editor/project/state/effects.focus.test.ts',
      'apps/extension/src/video-editor/project/state/effects.source-click.test.ts',
      'apps/extension/src/video-editor/project/state/effects.source-key.test.ts',
      'apps/extension/src/video-editor/project/state/effects.camera-phases.test.ts',
      'apps/extension/src/video-editor/project/state/effects.motion-blur.test.ts',
      'apps/extension/src/video-editor/project/state/effects.spatial.test.ts',
      'apps/extension/src/video-editor/project/state/effects.cursor.test.ts',
      'apps/extension/src/video-editor/project/state/effects.effect-instance.test.ts',
      'apps/extension/src/video-editor/project/state/effects.utility-lanes.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-editor-object-tracks',
    productionFile: 'apps/extension/src/video-editor/project/state/object-tracks.ts',
    reason:
      'Editor object-track state uses the normalized EffectV1-compatible model with direct proof.',
    testFiles: ['apps/extension/src/video-editor/project/state/object-tracks.test.ts'],
  },
];
