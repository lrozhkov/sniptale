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
    owner: 'effect-v1-backup-export-bundles',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/effect-bundles.ts',
    reason: 'EffectV1 bundle export closure has direct descriptor and asset-integrity proof.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/export/effect-bundles.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-export-descriptor',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/export/projects/video-effect-descriptor.ts',
    reason: 'Project EffectV1 descriptor assembly is exercised by the direct bundle export proof.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/export/effect-bundles.test.ts'],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-metadata',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/metadata/effect-bundles.ts',
    reason: 'EffectV1 backup metadata parsing has direct manifest and snapshot restore proof.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/manifest/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/effect-snapshots.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-restore-writer',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/restore/project/effect-bundle-writer.ts',
    reason: 'EffectV1 bundle writes are covered by direct integrity and atomic restore proof.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/effect-bundles.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-restore-preparation',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-effect-bundles.ts',
    reason: 'EffectV1 snapshot preparation has direct snapshot and project-prepare proof.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/effect-snapshots.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-backup-project-restore',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/projects/index.ts',
    reason: 'EffectV1 project restore assembly has direct multi-project restore proof.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts'],
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
      'Project duration synchronization reconciles EffectV1 host placement before applying duration.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/basics.test.ts',
      'apps/extension/src/features/video/project/effect-instance/reconcile.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-project-meta',
    productionFile: 'apps/extension/src/features/video/project/timeline/meta.ts',
    reason: 'The relocated project metadata owner has direct default and passthrough proof.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/project-meta.defaults.test.ts',
      'apps/extension/src/features/video/project/timeline/project-meta.passthrough.test.ts',
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
      'apps/extension/src/video-editor/preview/stage/scene/render-visual.test.tsx',
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
      'EffectV1 project actions, cursor preservation, instance authority, and utility lanes have direct state proof.',
    testFiles: [
      'apps/extension/src/video-editor/project/state/effects.test.ts',
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
