export const SCENARIO_AI_OWNER_MAPPINGS = [
  {
    owner: 'scenario-ai-session',
    exclusive: true,
    productionFile: 'apps/extension/src/scenario-editor/page-shell/use-ai-session.ts',
    reason:
      'The mounted assistant and autosave suites execute scenario model preparation and proposal application.',
    testFiles: [
      'apps/extension/src/scenario-editor/page-shell/ai-assistant.test.tsx',
      'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.autosave.test.tsx',
    ],
  },
  {
    owner: 'scenario-ai-redaction',
    productionFile: 'apps/extension/src/features/ai/scenario-redaction.ts',
    exclusive: true,
    reason:
      'Scenario AI redaction is covered through egress-authority and payload serialization suites.',
    testFiles: ['apps/extension/src/features/ai/egress-authority/index.test.ts'],
  },
];
