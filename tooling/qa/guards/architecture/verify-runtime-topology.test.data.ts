export const DEFAULT_DOC_MARKERS = [
  'apps/extension/src/background/index.ts',
  'apps/extension/src/content/index.tsx',
  'apps/extension/src/popup/index.tsx',
  'apps/extension/src/settings/index.tsx',
  'apps/extension/src/gallery/index.tsx',
  'apps/extension/src/design-system/index.tsx',
  'apps/extension/src/editor/index.tsx',
  'apps/extension/src/video-editor/index.tsx',
  'apps/extension/src/offscreen/offscreen.ts',
  'apps/extension/src/scenario-editor/index.tsx',
  'apps/extension/src/web-snapshot-viewer/index.tsx',
];

export const DEFAULT_RUNTIME_TOPOLOGY = [
  {
    id: 'background',
    root: 'apps/extension/src/background',
    manifestOwned: true,
    featureRoot: false,
    entrypointFiles: ['apps/extension/src/background/index.ts'],
    docsMarkers: ['apps/extension/src/background/index.ts'],
  },
  {
    id: 'content',
    root: 'apps/extension/src/content',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: ['apps/extension/src/content/index.tsx'],
    docsMarkers: ['apps/extension/src/content/index.tsx'],
  },
  {
    id: 'popup',
    root: 'apps/extension/src/popup',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: ['apps/extension/src/popup/index.html', 'apps/extension/src/popup/index.tsx'],
    docsMarkers: ['apps/extension/src/popup/index.tsx'],
  },
  {
    id: 'settings',
    root: 'apps/extension/src/settings',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/settings/index.html',
      'apps/extension/src/settings/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/settings/index.tsx'],
  },
  {
    id: 'gallery',
    root: 'apps/extension/src/gallery',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/gallery/index.html',
      'apps/extension/src/gallery/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/gallery/index.tsx'],
  },
  {
    id: 'design-system',
    root: 'apps/extension/src/design-system',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/design-system/index.html',
      'apps/extension/src/design-system/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/design-system/index.tsx'],
  },
  {
    id: 'editor',
    root: 'apps/extension/src/editor',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/editor/index.html',
      'apps/extension/src/editor/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/editor/index.tsx'],
  },
  {
    id: 'video-editor',
    root: 'apps/extension/src/video-editor',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/video-editor/index.html',
      'apps/extension/src/video-editor/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/video-editor/index.tsx'],
  },
  {
    id: 'offscreen',
    root: 'apps/extension/src/offscreen',
    manifestOwned: true,
    featureRoot: false,
    entrypointFiles: [
      'apps/extension/src/offscreen/offscreen.html',
      'apps/extension/src/offscreen/offscreen.ts',
    ],
    docsMarkers: [
      'apps/extension/src/offscreen/offscreen.html',
      'apps/extension/src/offscreen/offscreen.ts',
    ],
  },
  {
    id: 'scenario-editor',
    root: 'apps/extension/src/scenario-editor',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/scenario-editor/index.html',
      'apps/extension/src/scenario-editor/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/scenario-editor/index.tsx'],
  },
  {
    id: 'web-snapshot-viewer',
    root: 'apps/extension/src/web-snapshot-viewer',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/web-snapshot-viewer/index.html',
      'apps/extension/src/web-snapshot-viewer/index.tsx',
    ],
    docsMarkers: ['apps/extension/src/web-snapshot-viewer/index.tsx'],
  },
];

export const DEFAULT_WEB_ACCESSIBLE_RESOURCES = ['fonts/*'];
