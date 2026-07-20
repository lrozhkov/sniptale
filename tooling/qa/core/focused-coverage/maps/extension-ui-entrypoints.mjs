export const EXTENSION_UI_ENTRYPOINT_OWNER_MAPPINGS = [
  {
    owner: 'extension-ui-design-system-entrypoint',
    productionFile: 'apps/extension/src/design-system/index.tsx',
    reason: 'The app-root design-system entry is exercised by its shell entrypoint suite.',
    testFiles: ['apps/extension/src/design-system/shell/entry/index.test.tsx'],
  },
  {
    owner: 'extension-ui-gallery-entrypoint',
    productionFile: 'apps/extension/src/gallery/index.tsx',
    reason: 'The app-root gallery entry is exercised by its shell entrypoint suite.',
    testFiles: ['apps/extension/src/gallery/shell/app-shell/entrypoint.test.tsx'],
  },
  {
    owner: 'extension-ui-settings-entrypoint',
    productionFile: 'apps/extension/src/settings/index.tsx',
    reason: 'The app-root settings entry is exercised by its page entrypoint suite.',
    testFiles: ['apps/extension/src/settings/shell/page/entrypoint.test.tsx'],
  },
  {
    owner: 'extension-ui-scenario-editor-entrypoint',
    productionFile: 'apps/extension/src/scenario-editor/index.tsx',
    reason: 'The app-root scenario editor entry is exercised by its page-shell entrypoint suite.',
    testFiles: ['apps/extension/src/scenario-editor/page-shell/entrypoint.test.tsx'],
  },
  {
    owner: 'extension-ui-web-snapshot-viewer-entrypoint',
    productionFile: 'apps/extension/src/web-snapshot-viewer/index.tsx',
    reason: 'The app-root viewer entry is exercised by its shell entrypoint suite.',
    testFiles: ['apps/extension/src/web-snapshot-viewer/shell/app/index.test.tsx'],
  },
];
