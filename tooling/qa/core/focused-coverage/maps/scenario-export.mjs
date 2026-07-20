export const SCENARIO_EXPORT_OWNER_MAPPINGS = [
  {
    owner: 'scenario-export-html',
    productionPrefix: 'apps/extension/src/scenario-editor/project/export/html/',
    exclusive: true,
    reason: 'Scenario project HTML export changes are covered by focused HTML export suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/export/html/capture.test.ts',
      'apps/extension/src/scenario-editor/project/export/html/capture/media.test.ts',
      'apps/extension/src/scenario-editor/project/export/html/capture/missing.test.ts',
      'apps/extension/src/scenario-editor/project/export/html/fragments.test.ts',
      'apps/extension/src/scenario-editor/project/export/html/index.test.ts',
      'apps/extension/src/scenario-editor/project/export/html/text.test.ts',
    ],
  },
  {
    owner: 'scenario-export-deck',
    productionPrefix: 'apps/extension/src/scenario-editor/project/export/deck/',
    exclusive: true,
    reason: 'Scenario project deck export changes are covered by focused deck export suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/export/deck/assets/index.test.ts',
      'apps/extension/src/scenario-editor/project/export/deck/html/index.test.ts',
      'apps/extension/src/scenario-editor/project/export/deck/html/slide.test.ts',
      'apps/extension/src/scenario-editor/project/export/deck/index.test.ts',
      'apps/extension/src/scenario-editor/project/export/deck/markdown/index.test.ts',
      'apps/extension/src/scenario-editor/project/export/deck/markdown/slide.test.ts',
    ],
  },
  {
    owner: 'scenario-export-root-index',
    productionFile: 'apps/extension/src/scenario-editor/project/export/index.ts',
    exclusive: true,
    reason: 'Scenario project export root facade changes are covered by focused export suites.',
    testFiles: ['apps/extension/src/scenario-editor/project/export/index.test.ts'],
  },
  {
    owner: 'scenario-export-root-images',
    productionFile: 'apps/extension/src/scenario-editor/project/export/images.ts',
    exclusive: true,
    reason:
      'Scenario project export image rendering changes are covered by focused image export suites.',
    testFiles: ['apps/extension/src/scenario-editor/project/export/images.test.ts'],
  },
  {
    owner: 'scenario-export-root-helpers',
    productionFile: 'apps/extension/src/scenario-editor/project/export/helpers.ts',
    exclusive: true,
    reason: 'Scenario project export helper changes are covered by focused root export suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/export/index.test.ts',
      'apps/extension/src/scenario-editor/project/mutation/actions/project-crud/index.test.ts',
    ],
  },
  {
    owner: 'scenario-export-markdown',
    productionFile: 'apps/extension/src/scenario-editor/project/export/markdown.ts',
    exclusive: true,
    reason:
      'Scenario project Markdown export changes are covered by focused Markdown consumer suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/export/index.test.ts',
      'apps/extension/src/scenario-editor/project/mutation/actions/project-crud/index.test.ts',
      'apps/extension/src/scenario-editor/page-shell/shell-content.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/view.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/view.presentation.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/side-panels.test.tsx',
      'apps/extension/src/scenario-editor/export-dialog/deck/index.test.tsx',
      'apps/extension/src/scenario-editor/export-dialog/deck/option-toggles.test.tsx',
      'apps/extension/src/scenario-editor/export-dialog/deck/panel.test.tsx',
    ],
  },
];
