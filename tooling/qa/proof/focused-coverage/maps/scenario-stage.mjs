export const SCENARIO_STAGE_OWNER_MAPPINGS = [
  {
    owner: 'scenario-tour-action-list',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/image-object-list.tsx',
    exclusive: true,
    reason:
      'Real inspector and workspace tests exercise acquisition, global numbering, ordering, selection and removal through the action list.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/workspace.test.tsx',
    ],
  },
  {
    owner: 'scenario-guide-page-state',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/runtime/use-state.ts',
    exclusive: true,
    reason:
      'Hook fixtures exercise mounted edit admission, image publication, narration, templates and refusal paths that the page suite substitutes.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/runtime/use-state.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/runtime/image-edits.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/runtime/narration.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/runtime/templates.test.ts',
    ],
  },
  {
    owner: 'scenario-tour-library',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/library.tsx',
    exclusive: true,
    reason:
      'Real library and workspace tests retain selection and resource flows that the page test substitutes.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/library.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/workspace.test.tsx',
    ],
  },
  {
    owner: 'scenario-tour-inspector-settings',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/document-settings.tsx',
    exclusive: true,
    reason:
      'Tour tests use real inspector controls for stage image fit, mask inheritance and animation defaults.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
    ],
  },
  {
    owner: 'scenario-tour-inspector-settings',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/mask-settings.tsx',
    exclusive: true,
    reason:
      'Tour tests use real inspector controls for stage image fit, mask inheritance and animation defaults.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
    ],
  },
  {
    owner: 'scenario-tour-inspector-settings',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/transition-settings.tsx',
    exclusive: true,
    reason:
      'Real inspector tests exercise optional explanations and settings that the page test substitutes.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
    ],
  },
  {
    owner: 'scenario-tour-inspector-settings',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/playback-settings.tsx',
    exclusive: true,
    reason:
      'Real inspector tests exercise optional explanations and settings that the page test substitutes.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
    ],
  },
  {
    owner: 'scenario-tour-inspector-settings',
    productionFile: 'apps/extension/src/scenario-editor/page-shell/tour/camera-settings.tsx',
    exclusive: true,
    reason:
      'Real inspector tests exercise optional explanations and settings that the page test substitutes.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
    ],
  },
  {
    owner: 'scenario-guide-page',
    productionPrefix: 'apps/extension/src/scenario-editor/page-shell/',
    reason:
      'Guide rendering, stable navigation and save failure handling are exercised through the real guide page.',
    testFiles: ['apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx'],
  },
];
