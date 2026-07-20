import type { ScenarioNoteStep } from '../../../contracts/types/project';
import type { ScenarioNoteTone } from '@sniptale/runtime-contracts/scenario/types/base';
import { createBaseStep } from '../helpers';

export function createScenarioNoteStep(args: {
  body?: string;
  title: string;
  tone?: ScenarioNoteTone;
}): ScenarioNoteStep {
  return {
    ...createBaseStep({
      kind: 'note',
      title: args.title,
      ...(args.body === undefined ? {} : { body: args.body }),
    }),
    tone: args.tone ?? 'neutral',
  };
}
