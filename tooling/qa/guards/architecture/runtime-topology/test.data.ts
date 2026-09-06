export const DEFAULT_RUNTIME_TOPOLOGY = [
  {
    id: 'background',
    root: 'apps/extension/src/background',
    manifestOwned: true,
    featureRoot: false,
    entrypointFiles: ['apps/extension/src/background/index.ts'],
  },
  {
    id: 'content',
    root: 'apps/extension/src/content',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: ['apps/extension/src/content/index.tsx'],
  },
  {
    id: 'camera-recorder',
    root: 'apps/extension/src/camera-recorder',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: [
      'apps/extension/src/camera-recorder/index.html',
      'apps/extension/src/camera-recorder/index.tsx',
    ],
  },
  {
    id: 'popup',
    root: 'apps/extension/src/popup',
    manifestOwned: true,
    featureRoot: true,
    entrypointFiles: ['apps/extension/src/popup/index.html', 'apps/extension/src/popup/index.tsx'],
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
  },
  {
    id: 'effect-runtime-sandbox',
    root: 'apps/extension/src/effect-runtime-sandbox',
    manifestOwned: true,
    featureRoot: false,
    entrypointFiles: [
      'apps/extension/src/effect-runtime-sandbox/index.html',
      'apps/extension/src/effect-runtime-sandbox/index.ts',
      'apps/extension/src/effect-runtime-sandbox/worker/index.ts',
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
  },
];

export const DEFAULT_WEB_ACCESSIBLE_RESOURCES = ['fonts/*'];

export const DEFAULT_BUILD_HTML_INPUTS = [
  ['design-system', 'non-release'],
  ['editor', 'always'],
  ['scenario-editor', 'always'],
  ['video-editor', 'always'],
  ['settings', 'always'],
  ['gallery', 'always'],
  ['camera-recorder', 'always'],
  ['web-snapshot-viewer', 'always'],
  ['offscreen/offscreen', 'always'],
  ['popup', 'manifest'],
  ['effect-runtime-sandbox', 'manifest'],
].map(([runtimePath, mode]) => ({
  mode,
  outputPath: `apps/extension/src/${runtimePath}/index.html`.replace(
    '/offscreen/offscreen/index.html',
    '/offscreen/offscreen.html'
  ),
  sourcePath: `apps/extension/src/${runtimePath}/index.html`.replace(
    '/offscreen/offscreen/index.html',
    '/offscreen/offscreen.html'
  ),
}));
