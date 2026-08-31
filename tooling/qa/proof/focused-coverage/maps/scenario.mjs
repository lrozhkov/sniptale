import { SCENARIO_AI_OWNER_MAPPINGS } from './scenario-ai.mjs';
import { SCENARIO_EXPORT_OWNER_MAPPINGS } from './scenario-export.mjs';

export const SCENARIO_OWNER_MAPPINGS = [
  {
    owner: 'background-scenario-public-routes',
    productionFile: 'apps/extension/src/background/scenario/routes.ts',
    reason: 'The public scenario route entrypoint is covered by the scenario router suite.',
    testFiles: ['apps/extension/src/background/scenario/router/route.test.ts'],
  },
  ...SCENARIO_AI_OWNER_MAPPINGS,
  ...SCENARIO_EXPORT_OWNER_MAPPINGS,
];
