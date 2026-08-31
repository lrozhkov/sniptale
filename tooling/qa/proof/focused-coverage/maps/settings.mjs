export const SETTINGS_OWNER_MAPPINGS = [
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
    owner: 'settings-ai-secret-protection-dialog',
    productionFile:
      'apps/extension/src/settings/sections/ai/connections/surface/secret-protection-dialog.tsx',
    reason:
      'Secret protection dialog modes and submissions are covered by the focused dialog suites.',
    testFiles: [
      'apps/extension/src/settings/sections/ai/connections/surface/content.modals.test.tsx',
      'apps/extension/src/settings/sections/ai/connections/surface/content.secret-protection-dialog.test.tsx',
    ],
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
