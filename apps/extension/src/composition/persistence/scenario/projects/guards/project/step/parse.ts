import type { ScenarioStep } from '../../../../../../../features/scenario/contracts/types/project';
import { isRecord, isString } from '../../../../../../../contracts/messaging/validators';
import type { StepBase } from './base';
import { parseStepBase } from './base';
import { parseCaptureStep } from './capture';
import { parseTone } from './base';

function createSectionStep(base: StepBase): ScenarioStep {
  return {
    ...base,
    kind: 'section',
  };
}

function createNoteStep(base: StepBase, value: Record<string, unknown>): ScenarioStep {
  return {
    ...base,
    kind: 'note',
    tone: parseTone(value['tone']),
  };
}

function createDividerStep(base: StepBase): ScenarioStep {
  return {
    ...base,
    kind: 'divider',
  };
}

export function parseStep(value: unknown, index: number): ScenarioStep | null {
  if (!isRecord(value) || !isString(value['kind'])) {
    return null;
  }

  const base = parseStepBase(value, index);

  switch (value['kind']) {
    case 'capture':
      return parseCaptureStep(value, base);
    case 'section':
      return createSectionStep(base);
    case 'note':
      return createNoteStep(base, value);
    case 'divider':
      return createDividerStep(base);
    default:
      return null;
  }
}
