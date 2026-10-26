import { SCENARIO_AI_OWNER_MAPPINGS } from './scenario-ai.mjs';
import { SCENARIO_EXPORT_OWNER_MAPPINGS } from './scenario-export.mjs';

export const SCENARIO_OWNER_MAPPINGS = [
  {
    owner: 'background-scenario-public-routes',
    productionFile: 'apps/extension/src/background/scenario/routes.ts',
    reason: 'The public scenario route entrypoint is covered by the scenario router suite.',
    testFiles: ['apps/extension/src/background/scenario/router/route.test.ts'],
  },
  {
    owner: 'scenario-tour-persistence-consumers',
    productionFile: 'packages/runtime-contracts/src/scenario/tour-parser.ts',
    reason:
      'Tour admission controls persisted current/history payloads and portable restore. These ' +
      'consumers prove CAS, parallel writers, retry, opening journal recovery and nested action media references.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/projects/project.test.ts',
      'apps/extension/src/composition/persistence/scenario/store/project-records/store.test.ts',
      'apps/extension/src/composition/persistence/scenario/aggregate-mutations.test.ts',
      'apps/extension/src/composition/persistence/scenario/tour-persistence.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-codecs/scenario-tour.test.ts',
    ],
  },
  ...SCENARIO_AI_OWNER_MAPPINGS,
  ...SCENARIO_EXPORT_OWNER_MAPPINGS,
];
