export const CONTENT_ROOT_OWNER_MAPPINGS = [
  {
    owner: 'content-platform-dom-host',
    productionPrefix: 'apps/extension/src/content/platform/dom-host/',
    reason: [
      'Content-owned live DOM root, isolated style, event-path, and toast host authority',
      'are covered by content platform dom-host tests.',
    ].join(' '),
    testFiles: [
      'apps/extension/src/content/platform/dom-host/ui.test.ts',
      'apps/extension/src/content/platform/dom-host/isolated.test.ts',
      'apps/extension/src/content/platform/dom-host/toast-host.test.ts',
    ],
  },
  {
    owner: 'content-platform-dom-host-ui-roots',
    productionFile: 'apps/extension/src/content/platform/dom-host/ui-roots.ts',
    reason: [
      'Content-root surface creation is the platform DOM-host primitive',
      'and is covered by its owner-local test.',
    ].join(' '),
    testFiles: ['apps/extension/src/content/platform/dom-host/ui-roots.test.ts'],
  },
];
