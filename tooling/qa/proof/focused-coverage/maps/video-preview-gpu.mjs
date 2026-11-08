export const VIDEO_PREVIEW_GPU_OWNER_MAPPINGS = [
  {
    owner: 'native-persistent-gpu-frames',
    productionFile: 'apps/extension/src/video-editor/preview/cache/build-persistent.ts',
    reason:
      'Completed preview images remain owned through capture, encoding and persistent cache recovery.',
    testFiles: [
      'apps/extension/src/video-editor/preview/cache/build-persistent.test.ts',
      'apps/extension/src/video-editor/preview/cache/encode.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime-resume.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime-lifecycle.test.ts',
    ],
  },
  {
    owner: 'native-preview-frame-encoder',
    productionFile: 'apps/extension/src/video-editor/preview/cache/encode.ts',
    reason:
      'Completed preview images remain owned through capture, encoding and persistent cache recovery.',
    testFiles: [
      'apps/extension/src/video-editor/preview/cache/build-persistent.test.ts',
      'apps/extension/src/video-editor/preview/cache/encode.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime-resume.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime-lifecycle.test.ts',
    ],
  },
  {
    owner: 'native-exact-frame-bitmap-leases',
    productionFile: 'apps/extension/src/video-editor/preview/cache/exact-frame-cache.ts',
    reason:
      'Cached pixels and metadata remain borrowed through GPU completion and existing cache writers.',
    testFiles: [
      'apps/extension/src/video-editor/preview/cache/exact-frame-cache.test.ts',
      'apps/extension/src/video-editor/preview/cache/render.test.ts',
      'apps/extension/src/video-editor/preview/cache/build-exact.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime-resume.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime-lifecycle.test.ts',
    ],
  },
  {
    owner: 'native-stage-cache-publication',
    productionFile: 'apps/extension/src/video-editor/preview/stage/scene/render.ts',
    reason:
      'The scheduler owns a cache renderer lifetime and transfers completed output with its camera.',
    testFiles: [
      'apps/extension/src/video-editor/preview/stage/scene/render.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/render-scheduler.test.ts',
      'apps/extension/src/video-editor/preview/cache/render.test.ts',
      'apps/extension/src/video-editor/preview/cache/exact-frame-cache.test.ts',
    ],
  },
  {
    owner: 'shared-gpu-destination-admission',
    productionFile: 'apps/extension/src/features/video/composition/canvas/gpu-preview.ts',
    allowCrossOwner: true,
    reason:
      'Independent surface admission preserves default callers and Native retained endpoint ownership.',
    testFiles: [
      'apps/extension/src/features/video/composition/canvas/gpu-preview.test.ts',
      'apps/extension/src/features/video/composition/canvas/gpu-preview-dag.test.ts',
      'apps/extension/src/features/video/composition/canvas/gpu-preview-presentation.test.ts',
      'apps/extension/src/features/video/composition/canvas/bookend-preview-gpu.test.ts',
      'apps/extension/src/workflows/video-review/gpu-preview.test.ts',
      'apps/extension/src/workflows/video-review/gpu-preview-annotations.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/gpu-preview.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer-gpu-joins.test.ts',
    ],
  },
  {
    owner: 'shared-composition-endpoint-leases',
    productionFile: 'apps/extension/src/features/video/composition/canvas/join-endpoints.ts',
    allowCrossOwner: true,
    reason: 'Retained endpoint lifetime shares the Canvas transaction used by review and export.',
    testFiles: [
      'apps/extension/src/features/video/composition/canvas/join-endpoints.test.ts',
      'apps/extension/src/workflows/video-review/presentation-render.test.ts',
      'apps/extension/src/offscreen/project-export/composition-joins.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer-gpu-joins.test.ts',
    ],
  },
  {
    owner: 'native-retained-gpu-source-provider',
    productionFile: 'apps/extension/src/video-editor/preview/stage/scene/gpu-preview.ts',
    reason:
      'Native source and final output leases retain the configured provider through GPU completion.',
    testFiles: [
      'apps/extension/src/video-editor/preview/stage/scene/gpu-preview.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer.test.ts',
      'apps/extension/src/video-editor/preview/cache/materializer-gpu-joins.test.ts',
      'apps/extension/src/video-editor/preview/stage/scene/render.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/render-scheduler.test.ts',
    ],
  },
];
