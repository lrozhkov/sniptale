export const CONTENT_SELECTION_OWNER_MAPPINGS = [
  {
    owner: 'content-selection-mode-events-bridge',
    productionPrefix: 'apps/extension/src/content/selection/selection-mode/events/bridge/',
    exclusive: true,
    reason:
      'Selection event bridge ordering and runtime composition have bounded owner-local proof.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/events/bridge/root.test.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/composition.test.ts',
    ],
  },
];
