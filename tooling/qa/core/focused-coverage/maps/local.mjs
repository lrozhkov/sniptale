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
    owner: 'content-auto-blur-controller',
    productionPrefix: 'apps/extension/src/content/overlay/auto-blur/controller/',
    exclusive: true,
    reason:
      'Auto-blur session transitions, effects, and workflows have one owner-level behavior suite.',
    testFiles: ['apps/extension/src/content/overlay/auto-blur/controller/index.test.tsx'],
  },
  {
    owner: 'content-ai-pick-submit-feedback-predecessor',
    productionFile: 'apps/extension/src/content/overlay/ai/pick/controller/submit/feedback.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason:
      'The removed feedback-only leaf is covered through the apply transaction that now owns its user-visible outcomes.',
    testFiles: ['apps/extension/src/content/overlay/ai/pick/controller/submit/apply.test.ts'],
  },
  {
    owner: 'content-ai-pick-submit-types-predecessor',
    productionFile: 'apps/extension/src/content/overlay/ai/pick/controller/submit/types.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason:
      'The removed local type bag is covered by the narrowed apply, submit, and request owner contracts.',
    testFiles: [
      'apps/extension/src/content/overlay/ai/pick/controller/submit/apply.test.ts',
      'apps/extension/src/content/overlay/ai/pick/controller/submit/index.test.ts',
      'apps/extension/src/content/overlay/ai/pick/controller/submit/request.test.ts',
    ],
  },
  {
    owner: 'content-page-style-text-fields',
    productionFile:
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/text-fields.tsx',
    exclusive: true,
    reason: 'Property-control matrix and composed-view suites cover the text-field owner.',
    testFiles: [
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/field-matrix.test.tsx',
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/view.test.tsx',
    ],
  },
  {
    owner: 'content-page-style-property-fields-predecessor',
    productionFile:
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/fields.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason:
      'The removed property-field re-export ladder is covered by the owner surfaces that now import its contracts directly.',
    testFiles: [
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/field-matrix.test.tsx',
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/file-field.test.tsx',
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/text-controls.test.tsx',
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/view.test.tsx',
      'apps/extension/src/content/overlay/page-style-inspector/save/panel.test.tsx',
    ],
  },
  {
    owner: 'content-page-style-image-preview-predecessor',
    productionFile:
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/image-preview.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason:
      'The removed single-consumer image preview is covered through the property-control composition that now owns it.',
    testFiles: [
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/view.test.tsx',
    ],
  },
  {
    owner: 'content-page-style-retention-toggle-predecessor',
    productionFile:
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/retention-toggle.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed single-consumer retention toggle is covered through its save-panel owner.',
    testFiles: ['apps/extension/src/content/overlay/page-style-inspector/save/panel.test.tsx'],
  },
  {
    owner: 'content-overlay-app-layout-projection',
    productionFile: 'apps/extension/src/content/overlay/app-layout/props.ts',
    exclusive: true,
    reason:
      'The app layout projection is exercised through the app composition that builds and renders its scenario, toolbar, and dialog sections.',
    testFiles: ['apps/extension/src/content/overlay/app/view/index.test.tsx'],
  },
  {
    owner: 'content-overlay-scenario-controller',
    productionFile: 'apps/extension/src/content/overlay/scenario/controller.ts',
    exclusive: true,
    reason:
      'Scenario controller state, runtime, view-state, and effect composition execute through its direct orchestration suite.',
    testFiles: ['apps/extension/src/content/overlay/scenario/controller.test.tsx'],
  },
  {
    owner: 'content-overlay-toolbar-capture-menus',
    productionFile: 'apps/extension/src/content/overlay/toolbar/capture/menus.tsx',
    exclusive: true,
    reason:
      'Toolbar capture menu visibility and exact dropdown/viewport composition execute through its direct owner suite.',
    testFiles: ['apps/extension/src/content/overlay/toolbar/capture/menus.test.tsx'],
  },
  {
    owner: 'content-overlay-toolbar-viewport-mutation',
    productionFile: 'apps/extension/src/content/overlay/toolbar/view.tsx',
    exclusive: true,
    reason:
      'Toolbar viewport changes use the shared owner and its injected viewer-local mutation port.',
    testFiles: [
      'apps/extension/src/content/overlay/toolbar/shell/viewport-change.test.ts',
      'apps/extension/src/content/overlay/toolbar/shell/view.test.tsx',
    ],
  },
  {
    owner: 'content-page-preparation-local-save-hook',
    productionFile: 'apps/extension/src/content/parser/page-preparation/local-save/hook/index.ts',
    exclusive: true,
    reason:
      'The page-preparation local-save hook executes through the toolbar visibility, history, result, and retry behavior suites.',
    testFiles: [
      'apps/extension/src/content/overlay/toolbar/capture/local-save.file.test.tsx',
      'apps/extension/src/content/overlay/toolbar/capture/local-save.test.tsx',
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
    owner: 'popup-runtime-recording-data-predecessor',
    productionFile: 'apps/extension/src/popup/shell/runtime/assembly/recording-data.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason:
      'The removed recording-data projection is covered through the public runtime hook assembly.',
    testFiles: ['apps/extension/src/popup/shell/runtime/hook.test.tsx'],
  },
  {
    owner: 'popup-runtime-recording-projection-predecessor',
    productionFile: 'apps/extension/src/popup/shell/runtime/assembly/recording.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed recording projection is covered through the public runtime hook assembly.',
    testFiles: ['apps/extension/src/popup/shell/runtime/hook.test.tsx'],
  },
  {
    owner: 'content-area-selection-controller',
    productionFile: 'apps/extension/src/content/selection/area-selector/controller.ts',
    reason:
      'Area-selection listener, settlement, and cleanup ownership is exercised through its public controller suite.',
    testFiles: ['apps/extension/src/content/selection/area-selector/index.test.ts'],
  },
  {
    owner: 'content-highlighter-runtime-listeners',
    productionFile: 'apps/extension/src/content/selection/highlighter-runtime/runtime-listeners.ts',
    reason:
      'Highlighter listener registration and Escape policy are split across two owner-local behavior suites.',
    testFiles: [
      'apps/extension/src/content/selection/highlighter-runtime/runtime-escape-key.test.ts',
      'apps/extension/src/content/selection/highlighter-runtime/runtime-listeners.test.ts',
    ],
  },
  {
    owner: 'content-highlighter-runtime-mode',
    productionFile: 'apps/extension/src/content/selection/highlighter-runtime/mode.ts',
    reason:
      'Highlighter enable and disable lifecycle transactions retain separate owner-local behavior suites.',
    testFiles: [
      'apps/extension/src/content/selection/highlighter-runtime/mode.disable.test.ts',
      'apps/extension/src/content/selection/highlighter-runtime/mode.enable.test.ts',
    ],
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
      'Frame UI store state has owner-local frame history, mutation, and UI-controller coverage.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/clear.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/dom.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/remove.test.ts',
      'apps/extension/src/content/selection/frame-runtime/ui-controller/effects.test.tsx',
    ],
  },
  {
    owner: 'content-frame-settings-popover-state',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/state/index.ts',
    reason:
      'Frame-settings session state is exercised by the public surface, lifecycle, and action suites.',
    testFiles: [
      'apps/extension/src/content/selection/frame-settings-popover/index.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/state/helpers.test.ts',
      'apps/extension/src/content/selection/frame-settings-popover/state/lifecycle.test.tsx',
    ],
  },
  {
    owner: 'content-frame-settings-popover-surface',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/index.tsx',
    exclusive: true,
    reason:
      'Frame-settings controller, portal shell, and view wiring have one public surface proof.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'content-frame-settings-popover-body-predecessor',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/body.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed body forwarding layer is consolidated into the public popover surface.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'content-frame-settings-popover-portal-predecessor',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/surface.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed portal forwarding layer is consolidated into the public popover surface.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'content-frame-settings-popover-shell-predecessor',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/surface-shell.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed shell forwarding layer is consolidated into the public popover surface.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'gallery-library-types',
    productionFile: 'apps/extension/src/gallery/library/types.ts',
    reason:
      'Gallery filter, grid, and preview contracts have state, selector, and surface coverage.',
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
      'apps/extension/src/content/selection/frame-runtime/host-layout/reconcile.test.ts',
      'apps/extension/src/content/selection/frame-runtime/host-layout/service.test.ts',
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
    owner: 'settings-highlighter-section-composition',
    productionFile:
      'apps/extension/src/settings/sections/highlighter/section/useHighlighterSection.ts',
    reason:
      'Highlighter section composition keeps disposable UI state separate from its persistence session.',
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
