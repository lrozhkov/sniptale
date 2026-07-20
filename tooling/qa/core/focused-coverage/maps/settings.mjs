function mapFiles({ owner, productionFiles, reason, testFiles }) {
  return productionFiles.map((productionFile) => ({
    exclusive: true,
    owner,
    productionFile,
    reason,
    testFiles,
  }));
}

export const SETTINGS_OWNER_MAPPINGS = [
  ...mapFiles({
    owner: 'settings-ai-secret-protection-dialog',
    productionFiles: [
      'apps/extension/src/settings/sections/ai-providers/surface/secret-protection-dialog.tsx',
    ],
    reason:
      'Secret protection dialog modes and submissions are covered by the focused dialog suites.',
    testFiles: [
      'apps/extension/src/settings/sections/ai-providers/surface/content.modals.test.tsx',
      'apps/extension/src/settings/sections/ai-providers/surface/content.secret-protection-dialog.test.tsx',
    ],
  }),
  ...mapFiles({
    owner: 'settings-appearance-controls',
    productionFiles: [
      'apps/extension/src/settings/sections/appearance/content/context-menu-controls.tsx',
      'apps/extension/src/settings/sections/appearance/content/controls-card.tsx',
    ],
    reason:
      'Appearance controls are covered by their direct interaction and disabled-state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/appearance/content/context-menu-controls.guard.test.tsx',
      'apps/extension/src/settings/sections/appearance/content/context-menu-controls.test.tsx',
      'apps/extension/src/settings/sections/appearance/content/theme-chips.test.tsx',
    ],
  }),
  ...mapFiles({
    owner: 'settings-highlighter-field-sections',
    productionFiles: [
      'apps/extension/src/settings/sections/highlighter/border-preset-editor/fields/sections/basic-settings.tsx',
      'apps/extension/src/settings/sections/highlighter/border-preset-editor/fields/sections/custom-css-field.tsx',
    ],
    reason:
      'Highlighter field sections are covered by their root, index, and padding interaction suites.',
    testFiles: [
      'apps/extension/src/settings/sections/highlighter/border-preset-editor/fields/sections/index.test.tsx',
      'apps/extension/src/settings/sections/highlighter/border-preset-editor/fields/sections/padding-fields.test.tsx',
      'apps/extension/src/settings/sections/highlighter/border-preset-editor/fields/sections/root.test.tsx',
    ],
  }),
  ...mapFiles({
    owner: 'settings-image-section',
    productionFiles: [
      'apps/extension/src/settings/sections/image/format.tsx',
      'apps/extension/src/settings/sections/image/quality.tsx',
      'apps/extension/src/settings/sections/image/saving-state.tsx',
      'apps/extension/src/settings/sections/image/tips.tsx',
    ],
    reason:
      'Image format, quality, saving, and tip surfaces are covered by the real content suite.',
    testFiles: ['apps/extension/src/settings/sections/image/content.test.tsx'],
  }),
  ...mapFiles({
    owner: 'settings-quick-actions-compose',
    productionFiles: [
      'apps/extension/src/settings/sections/quick-actions/editor.tsx',
      'apps/extension/src/settings/sections/quick-actions/list.tsx',
    ],
    reason:
      'Quick-action editor and list branches are covered by the real compose and state suites.',
    testFiles: [
      'apps/extension/src/settings/sections/quick-actions/index.compose.test.tsx',
      'apps/extension/src/settings/sections/quick-actions/index.states.test.tsx',
    ],
  }),
  ...mapFiles({
    owner: 'settings-template-sections',
    productionFiles: ['apps/extension/src/settings/sections/templates/content.sections.tsx'],
    reason:
      'Template header, list, empty, loading, and row branches are covered by the content suite.',
    testFiles: ['apps/extension/src/settings/sections/templates/content.test.tsx'],
  }),
  ...mapFiles({
    owner: 'settings-default-viewport',
    productionFiles: [
      'apps/extension/src/settings/sections/viewport-presets/section-content/default-viewport.tsx',
    ],
    reason:
      'Default viewport options and loading state are covered by viewport content and list suites.',
    testFiles: [
      'apps/extension/src/settings/sections/viewport-presets/section-content/content.test.tsx',
      'apps/extension/src/settings/sections/viewport-presets/section-content/list.test.tsx',
    ],
  }),
];
