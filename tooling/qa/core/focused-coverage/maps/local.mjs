export const LOCAL_OWNER_MAPPINGS = [
  {
    owner: 'background-service-worker-entrypoint',
    productionFile: 'apps/extension/src/background/index.ts',
    reason: 'The service-worker entrypoint is exercised by its bounded runtime bootstrap suite.',
    testFiles: ['apps/extension/src/background/runtime/bootstrap/index.test.ts'],
  },
  {
    owner: 'offscreen-document-entrypoint',
    productionFile: 'apps/extension/src/offscreen/offscreen.ts',
    reason: 'The offscreen entrypoint is exercised by its bounded runtime entrypoint suite.',
    testFiles: ['apps/extension/src/offscreen/runtime/entrypoint.test.ts'],
  },
  {
    owner: 'ai-secret-unlock-request-store',
    productionFile:
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.store.ts',
    exclusive: true,
    reason: 'Secret-unlock request persistence has an owner-local lifecycle and replay suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.store.test.ts',
    ],
  },
  {
    owner: 'indexed-db-core',
    productionFile: 'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    exclusive: true,
    reason: 'IndexedDB schema and upgrade authority are exercised by the owner-local core suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.test.ts',
    ],
  },
  {
    owner: 'media-hub-references',
    productionFile: 'apps/extension/src/features/media-hub/references.ts',
    exclusive: true,
    reason: 'Media reference projection is exercised by its owner-local mixed-source suite.',
    testFiles: ['apps/extension/src/features/media-hub/references.test.ts'],
  },
  {
    owner: 'extension-editor-navigation',
    productionFile: 'apps/extension/src/platform/navigation/extension-pages/editor.ts',
    exclusive: true,
    reason: 'Canonical editor URL construction is exercised by the owner-local URL suite.',
    testFiles: ['apps/extension/src/platform/navigation/extension-pages/editor.test.ts'],
  },
  {
    owner: 'scenario-persistence-contracts',
    productionFile: 'apps/extension/src/composition/persistence/scenario/contracts.ts',
    allowCrossOwner: true,
    reason:
      'Scenario persistence record contracts are exercised through the project read-guard boundary suite.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.read-guards.test.ts'],
  },
  {
    owner: 'scenario-persistence-read-guards',
    productionFile: 'apps/extension/src/composition/persistence/scenario/read-guards.ts',
    allowCrossOwner: true,
    reason:
      'Scenario record parsers are exercised by the project persistence read-guard boundary suite.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.read-guards.test.ts'],
  },
  {
    owner: 'editor-bootstrap-contract',
    productionFile: 'apps/extension/src/features/editor/contracts/bootstrap.ts',
    allowCrossOwner: true,
    reason:
      'The editor bootstrap contract is exercised through the workflow owner that consumes and assembles it.',
    testFiles: ['apps/extension/src/workflows/editor/bootstrap/index.test.ts'],
  },
  {
    owner: 'highlighter-auto-blur-contract',
    productionFile: 'apps/extension/src/features/highlighter/contracts/auto-blur.ts',
    reason:
      'Auto-blur category order and contract constants are exercised by storage parsing and selection behavior suites.',
    testFiles: [
      'apps/extension/src/content/overlay/auto-blur/persistence/index.test.ts',
      'apps/extension/src/content/selection/auto-blur-runtime/match-selection.test.ts',
    ],
  },
  {
    owner: 'popup-export-page-content',
    productionFile: 'apps/extension/src/popup/shell/export/pages/content.tsx',
    reason:
      'Popup export page content switches between grouped session transfer state and ready selection props.',
    testFiles: ['apps/extension/src/popup/shell/export/pages/content.test.tsx'],
  },
  {
    owner: 'content-selection-mode-controller-runtime',
    productionFile: 'apps/extension/src/content/selection/selection-mode/controller/runtime.ts',
    reason:
      'Selection-mode controller runtime facade delegates to the owner-local runtime-state args assembler.',
    testFiles: ['apps/extension/src/content/selection/selection-mode/controller/runtime.test.ts'],
  },
  {
    owner: 'content-frame-runtime-contracts',
    productionFile: 'apps/extension/src/content/selection/frame-runtime/contracts/index.ts',
    reason:
      'Frame runtime contract shape is exercised through the frame manager, history bridge, and mutation owner suites.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/react/useFrameManager.test.tsx',
      'apps/extension/src/content/selection/frame-runtime/react/useFrameManagerMutations.test.tsx',
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/manager/runtime-mutations.test.ts',
    ],
  },
  {
    owner: 'content-frame-runtime-state',
    productionPrefix: 'apps/extension/src/content/selection/frame-runtime/state/',
    reason:
      'Frame UI store state was moved under the frame-runtime state owner and remains covered by ' +
      'frame history, mutation, and UI-controller suites.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/clear.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/dom.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/remove.test.ts',
      'apps/extension/src/content/selection/frame-runtime/ui-controller/effects.test.tsx',
    ],
  },
  {
    owner: 'gallery-library-types',
    productionFile: 'apps/extension/src/gallery/library/types.ts',
    reason:
      'Gallery library filter, grid, and preview type contracts are exercised through state type, ' +
      'selector, and gallery surface suites.',
    testFiles: [
      'apps/extension/src/gallery/state/types.test.ts',
      'apps/extension/src/gallery/state/selectors.test.ts',
      'apps/extension/src/gallery/shell/app-shell/layout.test.tsx',
    ],
  },
  {
    owner: 'content-frame-runtime-test-support',
    productionFile: 'apps/extension/src/content/selection/frame-runtime/test-support.ts',
    reason:
      'Frame runtime fixtures are covered by owner-local frame runtime suites that consume the shared builders.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/effects/geometry.test.ts',
      'apps/extension/src/content/selection/frame-runtime/effects/overlay-descriptors.test.ts',
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/roots/scroll/frame-updates.test.ts',
    ],
  },
  {
    owner: 'settings-editor-section',
    productionFile: 'apps/extension/src/settings/sections/editor/rows.tsx',
    reason: 'Settings editor preset rows are covered by the focused rows component suite.',
    testFiles: ['apps/extension/src/settings/sections/editor/rows.test.tsx'],
  },
  {
    owner: 'settings-editor-section',
    productionFile: 'apps/extension/src/settings/sections/editor/types.ts',
    reason: 'Settings editor preset row type contracts are covered by rows rendering tests.',
    testFiles: ['apps/extension/src/settings/sections/editor/rows.test.tsx'],
  },
  {
    owner: 'offscreen-project-export-service-root',
    productionFile: 'apps/extension/src/offscreen/project-export/service/index.ts',
    reason: 'Project export service root side-effect ordering is covered by root service tests.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/service/branches.test.ts',
      'apps/extension/src/offscreen/project-export/service/index.test.ts',
      'apps/extension/src/offscreen/project-export/service/lifecycle.test.ts',
      'apps/extension/src/offscreen/project-export/service/notifications.test.ts',
      'apps/extension/src/offscreen/project-export/service/root.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-persistence',
    productionFile: 'apps/extension/src/settings/sections/highlighter/section/persistence.ts',
    reason:
      'Highlighter persistence queue ownership is covered by queue and session regression suites.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/section/drag-actions.queue.test.ts',
      'apps/extension/src/settings/sections/highlighter/section/persistence-actions.behavior.test.ts',
      'apps/extension/src/settings/sections/highlighter/section/persistence-session.test.ts',
      'apps/extension/src/settings/sections/highlighter/section/persistence.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-persistence-actions',
    productionFile:
      'apps/extension/src/settings/sections/highlighter/section/persistence-actions.ts',
    reason: 'Highlighter settings persistence actions are covered by behavior regressions.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/section/persistence-actions.behavior.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-crud-actions',
    productionFile: 'apps/extension/src/settings/sections/highlighter/section/crud-actions.ts',
    reason: 'Highlighter preset CRUD actions are covered by focused action suites.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/section/actions.integration.test.ts',
      'apps/extension/src/settings/sections/highlighter/section/actions.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-drag-actions',
    productionFile: 'apps/extension/src/settings/sections/highlighter/section/drag-actions.ts',
    reason: 'Highlighter drag persistence ordering is covered by drag queue and integration tests.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/section/actions.integration.test.ts',
      'apps/extension/src/settings/sections/highlighter/section/drag-actions.queue.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-storage-state',
    productionFile: 'apps/extension/src/settings/sections/highlighter/section/state.ts',
    reason: 'Highlighter storage sync lifecycle is covered by state storage and race suites.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/section/state.loading-race.test.tsx',
      'apps/extension/src/settings/sections/highlighter/section/state.storage-sync.test.tsx',
      'apps/extension/src/settings/sections/highlighter/section/state.test.tsx',
    ],
  },
  {
    owner: 'settings-highlighter-hook-facade',
    productionFile:
      'apps/extension/src/settings/sections/highlighter/section/useHighlighterSection.ts',
    reason: 'Highlighter hook facade composition is covered by the hook surface suite.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/section/useHighlighterSection.test.tsx',
    ],
  },
  {
    owner: 'shared-video-project-validation',
    productionFile: 'apps/extension/src/features/video/project/validation/root.ts',
    reason: 'Video project boundary validation is covered by parser and transitive boundary tests.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/service/root.test.ts',
      'apps/extension/src/contracts/messaging/video/validators.project-export.test.ts',
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/features/video/project/validation/project-domain-boundary.test.ts',
      'apps/extension/src/features/video/project/validation/project.test.ts',
    ],
  },
  {
    owner: 'shared-video-project-validation',
    productionFile: 'apps/extension/src/features/video/project/validation/optional-branches.ts',
    reason: 'Optional video project branches are covered by focused parser fixtures.',
    testFiles: [
      'apps/extension/src/features/video/project/validation/project-domain-boundary.test.ts',
    ],
  },
  {
    owner: 'shared-color-selector-channel-fields',
    productionFile: 'apps/extension/src/ui/color-selector/picker-channel-fields.tsx',
    reason:
      'RGB/HSL channel composition is exercised by the expanded, section, and typography suites.',
    testFiles: [
      'apps/extension/src/ui/color-selector/expanded.test.tsx',
      'apps/extension/src/ui/color-selector/picker-sections.test.tsx',
      'apps/extension/src/ui/color-selector/typography.test.tsx',
    ],
  },
  {
    owner: 'shared-command-palette-results',
    productionFile: 'apps/extension/src/ui/command-palette/results.tsx',
    reason: 'Result grouping, empty state, selection, and shortcuts are covered by section suites.',
    testFiles: ['apps/extension/src/ui/command-palette/sections.test.tsx'],
  },
  {
    owner: 'shared-compact-inspector-row-controls',
    productionFile: 'apps/extension/src/ui/compact-inspector-controls/row-controls.tsx',
    reason: 'Option, status, and search rows are exercised by the compact surface suite.',
    testFiles: ['apps/extension/src/ui/compact-inspector-controls/surfaces.test.tsx'],
  },
  {
    owner: 'shared-compact-inspector-interactive-style',
    productionFile: 'apps/extension/src/ui/compact-inspector-controls/interactive-control-style.ts',
    reason: 'Interactive control variables and class contracts are covered by the index suite.',
    testFiles: ['apps/extension/src/ui/compact-inspector-controls/index.test.tsx'],
  },
];
