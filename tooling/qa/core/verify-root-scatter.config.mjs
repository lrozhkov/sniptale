export const TOP_LEVEL_SLICES = [
  'design-system',
  'gallery',
  'popup',
  'settings',
  'shared',
  'test-harness',
];

export const TOP_LEVEL_SLICE_SET = new Set(TOP_LEVEL_SLICES);
export const EXTENSION_TOP_LEVEL_SLICES = [
  'background',
  'camera-recorder',
  'content',
  'design-system',
  'editor',
  'gallery',
  'offscreen',
  'effect-runtime-sandbox',
  'popup',
  'settings',
  'scenario-editor',
  'video-editor',
  'web-snapshot-viewer',
];
export const EXTENSION_TOP_LEVEL_SLICE_SET = new Set(EXTENSION_TOP_LEVEL_SLICES);
export const ALLOWED_ENTRY_ROOT_FILES = new Set(['index.ts', 'index.tsx', 'index.html']);
export const ALLOWED_MANIFEST_ROOT_FILES = new Set([
  'apps/extension/src/camera-recorder/index.test.tsx',
  'apps/extension/src/offscreen/offscreen.ts',
  'apps/extension/src/offscreen/offscreen.html',
]);
export const RETIRED_RUNTIME_ROOT_PATTERNS = [
  /^src\/background(?:\/|$)/u,
  /^src\/content(?:\/|$)/u,
  /^src\/offscreen(?:\/|$)/u,
  /^src\/(?:effect-runtime-sandbox|package-renderer-sandbox)(?:\/|$)/u,
  /^src\/editor(?:\/|$)/u,
  /^src\/scenario-editor(?:\/|$)/u,
  /^src\/video-editor(?:\/|$)/u,
];
export const RETIRED_ROOT_PATTERNS = [
  /^scripts\//u,
  /^tests\//u,
  /^test-support\//u,
  /^src\/test-harness\//u,
  /^\.hatiqo\//u,
  /^cases\//u,
];
export const RETIRED_ROOT_MESSAGE = [
  'This retired root must not be reintroduced;',
  'use tooling-owned paths such as tooling/test, tooling/release, tooling/backup, or tooling/configs.',
].join(' ');
export const RETIRED_RUNTIME_ROOT_MESSAGE = [
  'This app runtime root moved to apps/extension/src and must not be reintroduced under src.',
  'Use the canonical app-root owner path.',
].join(' ');
