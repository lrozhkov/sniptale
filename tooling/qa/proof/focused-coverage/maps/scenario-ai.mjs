export const SCENARIO_AI_OWNER_MAPPINGS = [
  {
    owner: 'scenario-ai-redaction',
    productionFile: 'apps/extension/src/features/ai/scenario-redaction.ts',
    exclusive: true,
    reason:
      'Scenario AI redaction is covered through egress-authority and payload serialization suites.',
    testFiles: ['apps/extension/src/features/ai/egress-authority/index.test.ts'],
  },
];
