import { EFFECT_V1_INTEGRATION_OWNER_MAPPINGS } from './effect-v1-integration.mjs';

export const EFFECT_V1_OWNER_MAPPINGS = [
  {
    exclusive: true,
    owner: 'effect-v1-locked-contract',
    productionPrefix: 'packages/runtime-contracts/src/effect-v1/',
    reason:
      'The locked EffectV1 validator, graph, timeline, authoring, and asset boundaries have direct parity proof.',
    testFiles: [
      'packages/runtime-contracts/src/effect-v1/asset/integrity.test.ts',
      'packages/runtime-contracts/src/effect-v1/contract/authoring.test.ts',
      'packages/runtime-contracts/src/effect-v1/contract/graph-rejections.test.ts',
      'packages/runtime-contracts/src/effect-v1/contract/graph.test.ts',
      'packages/runtime-contracts/src/effect-v1/contract/index.test.ts',
      'packages/runtime-contracts/src/effect-v1/contract/timeline-rejections.test.ts',
      'packages/runtime-contracts/src/effect-v1/contract/validation-branches.test.ts',
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
    owner: 'effect-v1-import-boundary',
    productionPrefix: 'apps/extension/src/features/video/project/effect-bundle/',
    reason: 'EffectV1 raw JSON and ZIP import boundaries are covered by corpus and failure suites.',
    testFiles: [
      'apps/extension/src/features/video/project/effect-bundle/boundary.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/zip/assets.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/boundaries.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/worker/boundary.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/zip/index.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/import/index.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/manifest/index.test.ts',
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
    productionPrefix: 'apps/extension/src/features/video/project/effect-instance/',
    reason:
      'Catalog apply, immutable snapshot integrity, timing, target semantics, and quota failure have direct proof.',
    testFiles: [
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
      'EffectV1 persisted branch structure, quota, identity, and semantic references have direct proof.',
    testFiles: ['apps/extension/src/features/video/project/validation/effect-instances.test.ts'],
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
    productionPrefix: 'apps/extension/src/effect-runtime-sandbox/',
    reason:
      'The declarative sandbox protocol, broker, interpreter, and SVG paths have direct proof.',
    testFiles: [
      'apps/extension/src/effect-runtime-sandbox/policy/guards.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/prepare-frame.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/request-assets.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/svg/preflight.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/svg/vector-source.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/worker-request.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/request-boundary.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/runtime.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/session.test.ts',
      'apps/extension/src/effect-runtime-sandbox/broker/index-entry.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/execute.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/index.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/interpreter/command-surface.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/interpreter/interpreter-expression.sdk-parity.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/interpreter/interpreter-graph.sdk-parity.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/interpreter/interpreter-resolution.sdk-parity.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/math.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/model/render-model.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/protocol/request.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/render-context.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/render-primitives.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/svg/vector-payload.sdk-parity.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/svg/vector-renderer.test.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/timeline/motion-path.sdk-parity.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'effect-v1-catalog-persistence',
    productionPrefix: 'apps/extension/src/composition/persistence/effect-bundles/',
    reason: 'EffectV1 catalog transactions, invalid rows, and integrity reads have direct proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/effect-bundles/catalog-builder.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/index.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/integrity.test.ts',
    ],
  },
  ...EFFECT_V1_INTEGRATION_OWNER_MAPPINGS,
];
