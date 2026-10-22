export const CONTENT_ROOT_OWNER_MAPPINGS = [
  {
    owner: 'compact-inspector-color-and-choice-controls',
    productionFile: 'apps/extension/src/ui/compact-inspector-controls/controls.tsx',
    reason:
      'Shared color and selection geometry has direct inspector interaction and layout proof.',
    testFiles: [
      'apps/extension/src/ui/compact-inspector-controls/color-field.test.tsx',
      'apps/extension/src/ui/compact-inspector-controls/controls.coverage.test.tsx',
      'apps/extension/src/ui/compact-inspector-controls/index.test.tsx',
      'apps/extension/src/ui/compact-inspector-controls/parameter-layout.test.tsx',
    ],
  },
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
  {
    owner: 'content-design-review-feedback-panel-position',
    productionFile: 'apps/extension/src/content/overlay/design-review/feedback-panel/position.ts',
    exclusive: true,
    reason: 'Feedback-panel drag positioning is exercised through its owner surface suite.',
    testFiles: ['apps/extension/src/content/overlay/design-review/feedback-panel/view.test.tsx'],
  },
];
