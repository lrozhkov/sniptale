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
    owner: 'content-selection-mode-runtime-drag-actions',
    productionPrefix: 'apps/extension/src/content/selection/selection-mode/runtime/drag/',
    exclusive: true,
    reason:
      'Selection drag, hover, and element runtime actions share one session transition owner.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/events/bridge/root.test.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/drag/drag.test.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/drag/index.test.ts',
    ],
  },
  {
    owner: 'content-selection-mode-runtime-setup',
    productionPrefix: 'apps/extension/src/content/selection/selection-mode/runtime/setup/',
    exclusive: true,
    reason: 'Selection runtime setup and its composition have bounded single-session proof.',
    testFiles: [
      'apps/extension/src/content/selection/selection-mode/runtime/composition.test.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/setup/index.test.ts',
    ],
  },
  {
    owner: 'content-region-selector-surface',
    productionFile: 'apps/extension/src/content/selection/region-selector/surface.ts',
    exclusive: true,
    reason: 'Region selector DOM surface rendering has bounded visual-state proof.',
    testFiles: [
      'apps/extension/src/content/selection/region-selector/surface.coverage.test.ts',
      'apps/extension/src/content/selection/region-selector/surface.test.ts',
    ],
  },
  {
    owner: 'content-region-selector-runtime-predecessor',
    productionFile: 'apps/extension/src/content/selection/region-selector/runtime.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed display proxy is consolidated into the region selector surface owner.',
    testFiles: [
      'apps/extension/src/content/selection/region-selector/surface.coverage.test.ts',
      'apps/extension/src/content/selection/region-selector/surface.test.ts',
    ],
  },
  {
    owner: 'content-region-selector-events',
    productionFile: 'apps/extension/src/content/selection/region-selector/events.ts',
    exclusive: true,
    reason: 'Region selector root and document event lifecycles have bounded owner proof.',
    testFiles: [
      'apps/extension/src/content/selection/region-selector/events.test.ts',
      'apps/extension/src/content/selection/region-selector/index.coverage.test.ts',
      'apps/extension/src/content/selection/region-selector/index.test.ts',
    ],
  },
  {
    owner: 'content-region-selector-document-events-predecessor',
    productionFile: 'apps/extension/src/content/selection/region-selector/document-events.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed document-event fragment is consolidated into the event lifecycle owner.',
    testFiles: [
      'apps/extension/src/content/selection/region-selector/events.test.ts',
      'apps/extension/src/content/selection/region-selector/index.coverage.test.ts',
      'apps/extension/src/content/selection/region-selector/index.test.ts',
    ],
  },
  {
    owner: 'content-region-selector-composition',
    productionFile: 'apps/extension/src/content/selection/region-selector/index.ts',
    exclusive: true,
    reason: 'Region selector state, event, surface, and messaging composition has bounded proof.',
    testFiles: [
      'apps/extension/src/content/selection/region-selector/index.coverage.test.ts',
      'apps/extension/src/content/selection/region-selector/index.test.ts',
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
