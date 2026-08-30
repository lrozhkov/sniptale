const CONTROLLER_CONTRACT_FILES = [
  'apps/extension/src/video-editor/runtime/controller/contracts/header.ts',
  'apps/extension/src/video-editor/runtime/controller/contracts/insertion.ts',
  'apps/extension/src/video-editor/runtime/controller/contracts/preview.ts',
  'apps/extension/src/video-editor/runtime/controller/contracts/sidebar.ts',
  'apps/extension/src/video-editor/runtime/controller/contracts/surface.ts',
  'apps/extension/src/video-editor/runtime/controller/contracts/timeline.ts',
  'apps/extension/src/video-editor/runtime/controller/contracts/workspace.ts',
];

const SIDEBAR_CONTRACT_FILES = [
  'apps/extension/src/video-editor/workspace/sidebar/contracts/props.ts',
  'apps/extension/src/video-editor/workspace/sidebar/contracts/selection-panel.ts',
];

const controllerContractMappings = CONTROLLER_CONTRACT_FILES.map((productionFile) => ({
  owner: 'video-editor-controller-contract-adapters',
  productionFile,
  reason: [
    'Controller port contracts are exercised through the focused controller builder,',
    'surface, and command-palette adapter suites.',
  ].join(' '),
  testFiles: [
    'apps/extension/src/video-editor/runtime/controller/builders.test.ts',
    'apps/extension/src/video-editor/runtime/controller/index.test.tsx',
    'apps/extension/src/video-editor/shell/command-palette/actions.test.tsx',
  ],
}));

const sidebarContractMappings = SIDEBAR_CONTRACT_FILES.map((productionFile) => ({
  owner: 'video-editor-workspace-sidebar-contract-adapters',
  productionFile,
  reason:
    'Sidebar contracts are exercised by shell, panel-content, and selection routing adapter suites.',
  testFiles: [
    'apps/extension/src/video-editor/workspace/sidebar/panel-content.test.tsx',
    'apps/extension/src/video-editor/workspace/sidebar/selection/inspect.test.tsx',
    'apps/extension/src/video-editor/workspace/sidebar/shell.test.tsx',
  ],
}));

export const VIDEO_EDITOR_ARCHITECTURE_OWNER_MAPPINGS = [
  ...controllerContractMappings,
  {
    allowCrossOwner: true,
    owner: 'video-editor-preview-preferences-contract',
    productionFile: 'apps/extension/src/features/video/preview/preferences.ts',
    reason: 'Preview mode, raster, and zoom values are covered by page-local contract proof.',
    testFiles: [
      'apps/extension/src/video-editor/contracts/preview-runtime.test.ts',
      'apps/extension/src/composition/persistence/video-editor-preview-preferences/model.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'video-editor-preview-preferences-owner',
    productionPrefix:
      'apps/extension/src/composition/persistence/video-editor-preview-preferences/',
    reason: 'Validated preview preference reads and serialized writes have direct owner proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/video-editor-preview-preferences/model.test.ts',
      'apps/extension/src/composition/persistence/video-editor-preview-preferences/storage.test.ts',
      'apps/extension/src/composition/persistence/privacy-erasure/inventory.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'video-editor-preview-preferences-runtime-adapter',
    productionFile: 'apps/extension/src/video-editor/runtime/controller/preview-preferences.ts',
    reason:
      'Workspace-owned hydration, optimistic updates, save failure, and retry behavior have direct hook proof.',
    testFiles: ['apps/extension/src/video-editor/runtime/controller/preview-preferences.test.tsx'],
  },
  {
    owner: 'video-editor-preview-cache-runtime',
    productionPrefix: 'apps/extension/src/video-editor/preview/cache/',
    reason:
      'Preview revision, exact-frame LRU, materialization, and fragmented AVC preparation have focused cache proof.',
    testFiles: [
      'apps/extension/src/video-editor/preview/cache/encode.test.ts',
      'apps/extension/src/video-editor/preview/cache/exact-frame-cache.test.ts',
      'apps/extension/src/video-editor/preview/cache/render.test.ts',
      'apps/extension/src/video-editor/preview/cache/revision.test.ts',
      'apps/extension/src/video-editor/preview/cache/runtime.test.ts',
      'apps/extension/src/video-editor/preview/cache/segments.test.ts',
    ],
  },
  {
    owner: 'video-editor-preview-sizing',
    productionPrefix: 'apps/extension/src/video-editor/preview/stage/sizing/',
    reason: 'Zoom and even 4K-bounded raster policies have direct focused proof.',
    testFiles: [
      'apps/extension/src/video-editor/preview/stage/sizing/raster.test.ts',
      'apps/extension/src/video-editor/preview/stage/sizing/zoom.test.ts',
    ],
  },
  {
    owner: 'video-editor-preview-stage-contract-adapters',
    productionFile: 'apps/extension/src/video-editor/preview/stage/types.ts',
    reason: 'Preview stage contracts are exercised by the stage runtime and scene adapter suites.',
    testFiles: [
      'apps/extension/src/video-editor/preview/stage/runtime/index.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/index.test.tsx',
    ],
  },
  {
    owner: 'video-editor-timeline-project-contract-adapters',
    productionFile: 'apps/extension/src/video-editor/timeline/project/types.ts',
    reason: 'Timeline project contracts are exercised by the canvas and track-list adapter suites.',
    testFiles: [
      'apps/extension/src/video-editor/timeline/project/canvas/index.test.tsx',
      'apps/extension/src/video-editor/timeline/project/tracks/list.test.tsx',
    ],
  },
  ...sidebarContractMappings,
];
