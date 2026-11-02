export const SETTINGS_OWNER_MAPPINGS = [
  {
    owner: 'canonical-settings-persistence',
    productionFile: 'apps/extension/src/composition/persistence/settings/index.ts',
    reason: `Settings readers, queued writers, subscriptions and reset consumers retain canonical
      preferences and reject stale approvals.`,
    testFiles: [
      'apps/extension/src/composition/persistence/settings/array.guards.test.ts',
      'apps/extension/src/composition/persistence/settings/context-menu-layout-chunks.test.ts',
      'apps/extension/src/composition/persistence/settings/coordination.test.ts',
      'apps/extension/src/composition/persistence/settings/defaults.test.ts',
      'apps/extension/src/composition/persistence/settings/file-scheme-consent.test.ts',
      'apps/extension/src/composition/persistence/settings/filename-rules.test.ts',
      'apps/extension/src/composition/persistence/settings/guards.coverage.test.ts',
      'apps/extension/src/composition/persistence/settings/index.test.ts',
      'apps/extension/src/composition/persistence/settings/mutations.test.ts',
      'apps/extension/src/composition/persistence/settings/nested-patch.test.ts',
      'apps/extension/src/composition/persistence/settings/page-launch.test.ts',
      'apps/extension/src/composition/persistence/settings/patch.test.ts',
      'apps/extension/src/composition/persistence/settings/read-purity.test.ts',
      'apps/extension/src/composition/persistence/settings/recording-controls.test.ts',
      'apps/extension/src/composition/persistence/settings/toolbar-placement.test.ts',
      'apps/extension/src/composition/persistence/ai-settings/alpha-reset.test.ts',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-viewport-presets',
    productionPrefix: 'apps/extension/src/settings/sections/capture/screen-sizes/',
    reason: 'Viewport template CRUD, grouping, ordering, and sync are covered by focused suites.',
    testFiles: [
      'apps/extension/src/settings/sections/capture/screen-sizes/content.test.tsx',
      'apps/extension/src/settings/sections/capture/screen-sizes/controller.test.tsx',
      'apps/extension/src/settings/sections/capture/screen-sizes/helpers.test.ts',
      'apps/extension/src/settings/sections/capture/screen-sizes/index.test.tsx',
      'apps/extension/src/settings/sections/capture/screen-sizes/section-content/list/empty-state.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-shared-secret-protection',
    productionPrefix: 'apps/extension/src/settings/secret-protection/',
    reason:
      'Shared protection status, participant commands and dialog lifecycle retain direct and AI/WebDAV composition proof.',
    testFiles: [
      'apps/extension/src/settings/secret-protection/controller.test.tsx',
      'apps/extension/src/settings/secret-protection/context.test.tsx',
      'apps/extension/src/settings/secret-protection/view.test.tsx',
      'apps/extension/src/settings/secret-protection/dialog.test.tsx',
      'apps/extension/src/settings/secret-protection/integration.test.tsx',
      'apps/extension/src/settings/sections/ai/connections/surface/content.modals.test.tsx',
      'apps/extension/src/settings/sections/capture/saving/sync-connection.test.tsx',
      'apps/extension/src/settings/sections/system/access-data/index.test.tsx',
      'apps/extension/src/settings/shell/page/index.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-shared-secret-protection-client',
    productionFile: 'apps/extension/src/settings/runtime/secret-protection.ts',
    reason:
      'The injected shared protection client retains status, participant command and wire failure proof.',
    testFiles: ['apps/extension/src/settings/runtime/secret-protection.test.ts'],
  },
  {
    exclusive: true,
    owner: 'settings-appearance-controls',
    productionFile:
      'apps/extension/src/settings/sections/general/interface-browser/content/context-menu-controls.tsx',
    reason:
      'Appearance controls are covered by their direct interaction and disabled-state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/general/interface-browser/content/context-menu-controls.guard.test.tsx',
      'apps/extension/src/settings/sections/general/interface-browser/content/context-menu-controls.test.tsx',
      'apps/extension/src/settings/sections/general/interface-browser/content/theme-chips.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-appearance-controls',
    productionFile:
      'apps/extension/src/settings/sections/general/interface-browser/content/controls-card.tsx',
    reason:
      'Appearance controls are covered by their direct interaction and disabled-state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/general/interface-browser/content/controls-card.test.tsx',
      'apps/extension/src/settings/sections/general/interface-browser/content/context-menu-controls.guard.test.tsx',
      'apps/extension/src/settings/sections/general/interface-browser/content/context-menu-controls.test.tsx',
      'apps/extension/src/settings/sections/general/interface-browser/content/theme-chips.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'highlighter-preset-editor-field-sections',
    productionFile:
      'apps/extension/src/ui/highlighter-preset-editor/fields/sections/basic-settings.tsx',
    reason: 'Highlighter field sections are covered by their interaction suites.',
    testFiles: [
      'apps/extension/src/ui/highlighter-preset-editor/fields/sections/index.test.tsx',
      'apps/extension/src/ui/highlighter-preset-editor/fields/sections/padding-fields.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'highlighter-preset-editor-field-sections',
    productionFile:
      'apps/extension/src/ui/highlighter-preset-editor/fields/sections/custom-css-field.tsx',
    reason: 'Highlighter field sections are covered by their interaction suites.',
    testFiles: [
      'apps/extension/src/ui/highlighter-preset-editor/fields/sections/index.test.tsx',
      'apps/extension/src/ui/highlighter-preset-editor/fields/sections/padding-fields.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-image-section',
    productionFile: 'apps/extension/src/settings/sections/capture/media-quality/image/format.tsx',
    reason: 'Image format, quality, and saving surfaces are covered by the real content suite.',
    testFiles: [
      'apps/extension/src/settings/sections/capture/media-quality/image/content.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-image-section',
    productionFile: 'apps/extension/src/settings/sections/capture/media-quality/image/quality.tsx',
    reason: 'Image format, quality, and saving surfaces are covered by the real content suite.',
    testFiles: [
      'apps/extension/src/settings/sections/capture/media-quality/image/content.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-quick-actions-compose',
    productionFile: 'apps/extension/src/settings/sections/capture/quick-actions/editor.tsx',
    reason:
      'Quick-action editor and list branches are covered by the real compose and state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/capture/quick-actions/index.compose.test.tsx',
      'apps/extension/src/settings/sections/capture/quick-actions/editor-appearance.test.tsx',
      'apps/extension/src/settings/sections/capture/quick-actions/index.states.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-quick-actions-compose',
    productionFile: 'apps/extension/src/settings/sections/capture/quick-actions/index.tsx',
    reason: 'The quick-actions section root is covered by its real compose and state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/capture/quick-actions/index.compose.test.tsx',
      'apps/extension/src/settings/sections/capture/quick-actions/index.states.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-quick-actions-compose',
    productionFile: 'apps/extension/src/settings/sections/capture/quick-actions/list.tsx',
    reason:
      'Quick-action editor and list branches are covered by the real compose and state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/capture/quick-actions/index.compose.test.tsx',
      'apps/extension/src/settings/sections/capture/quick-actions/index.states.test.tsx',
    ],
  },
  {
    exclusive: true,
    owner: 'settings-template-sections',
    productionFile:
      'apps/extension/src/settings/sections/ai/prompts/templates/content.sections.tsx',
    reason:
      'Template header, list, empty, loading, and row branches are covered by the content suite.',
    testFiles: ['apps/extension/src/settings/sections/ai/prompts/templates/content.test.tsx'],
  },
];
