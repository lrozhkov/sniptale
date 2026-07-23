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
  {
    owner: 'content-selection-mode-pointer-lifecycle',
    productionPrefix:
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/',
    exclusive: true,
    reason:
      'Selection pointer lifecycle, target resolution, and handler wiring have bounded owner proof.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/events/commands.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/handlers/pointer.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/index.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-down.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-leave.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-move.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-up.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/target.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer.test.ts',
    ],
  },
];
