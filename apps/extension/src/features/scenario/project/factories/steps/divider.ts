import type { ScenarioDividerStep } from '../../../contracts/types/project';
import { createBaseStep } from '../helpers';

export function createScenarioDividerStep(): ScenarioDividerStep {
  return {
    ...createBaseStep({
      kind: 'divider',
    }),
  };
}
