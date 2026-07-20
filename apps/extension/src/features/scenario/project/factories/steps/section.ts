import type { ScenarioSectionStep } from '../../../contracts/types/project';
import { createBaseStep } from '../helpers';

export function createScenarioSectionStep(args: {
  body?: string;
  title: string;
}): ScenarioSectionStep {
  return {
    ...createBaseStep({
      kind: 'section',
      title: args.title,
      ...(args.body === undefined ? {} : { body: args.body }),
    }),
  };
}
