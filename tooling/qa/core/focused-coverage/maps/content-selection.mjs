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
      'apps/extension/src/content/selection/selection-mode/events/handlers/index.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/index.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-down.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-leave.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-move.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/mouse-up.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer-handlers/target.test.ts',
      'apps/extension/src/content/selection/selection-mode/events/pointer.test.ts',
    ],
  },
  {
    owner: 'content-selection-mode-event-handler-factory',
    productionPrefix: 'apps/extension/src/content/selection/selection-mode/events/handlers/',
    exclusive: true,
    reason: 'Selection activation and pointer handler wiring have bounded owner proof.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/events/handlers/index.test.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/composition.test.ts',
    ],
  },
  {
    owner: 'content-selection-mode-listener-lifecycle',
    productionPrefix: 'apps/extension/src/content/selection/selection-mode/events/listeners/',
    exclusive: true,
    reason:
      'Selection listener registration, runtime mapping, and cleanup have bounded owner proof.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/events/listeners/index.test.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/composition.test.ts',
    ],
  },
  {
    owner: 'content-selection-mode-overlay-cancel-style-predecessor',
    productionFile:
      'apps/extension/src/content/selection/selection-mode/ui/styles.cancel-button.data.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed cancel style fragment is consolidated into the overlay stylesheet owner.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/ui/container.test.ts',
      'apps/extension/src/content/selection/selection-mode/ui/styles.constants.test.ts',
    ],
  },
  {
    owner: 'content-selection-mode-overlay-input-style-predecessor',
    productionFile: 'apps/extension/src/content/selection/selection-mode/ui/styles.inputs.data.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed input style fragment is consolidated into the overlay stylesheet owner.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/ui/container.test.ts',
      'apps/extension/src/content/selection/selection-mode/ui/styles.constants.test.ts',
    ],
  },
  {
    owner: 'content-selection-mode-overlay-toggle-style-predecessor',
    productionFile: 'apps/extension/src/content/selection/selection-mode/ui/styles.toggle.data.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed toggle style fragment is consolidated into the overlay stylesheet owner.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/ui/container.test.ts',
      'apps/extension/src/content/selection/selection-mode/ui/styles.constants.test.ts',
    ],
  },
];
