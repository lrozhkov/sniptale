export const SCENARIO_STAGE_OWNER_MAPPINGS = [
  {
    owner: 'scenario-guide-page',
    productionPrefix: 'apps/extension/src/scenario-editor/page-shell/',
    reason:
      'Guide rendering, stable navigation and save failure handling are exercised through the real guide page.',
    testFiles: ['apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx'],
  },
];
