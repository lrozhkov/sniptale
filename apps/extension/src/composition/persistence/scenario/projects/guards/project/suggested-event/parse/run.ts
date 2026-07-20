import type { ScenarioSuggestedEvent } from '../../../../../../../../features/scenario/contracts/types/project';
import type { SuggestedEventValidators } from '../types';
import { hasSuggestedEventShape } from '../validation';
import { getSuggestedEventData } from './data';
import { getSuggestedEventId } from './id';
import { normalizeSuggestedEventStatus } from './status';

export function parseSuggestedEvent(
  value: unknown,
  index: number,
  validators: SuggestedEventValidators
): ScenarioSuggestedEvent | null {
  if (!validators.isRecord(value) || !hasSuggestedEventShape(value, validators)) {
    return null;
  }

  const kind = value['kind'];
  const createdAt = value['createdAt'];
  const message = value['message'];
  if (
    !validators.isScenarioSuggestedEventKind(kind) ||
    !validators.isNumber(createdAt) ||
    !validators.isString(message)
  ) {
    return null;
  }

  const status = normalizeSuggestedEventStatus(value['status']);
  const parsedData = getSuggestedEventData(validators, value['data']);

  return {
    id: getSuggestedEventId(value['id'], index),
    kind,
    status,
    createdAt,
    message,
    sourceStepId:
      value['sourceStepId'] === null || typeof value['sourceStepId'] === 'string'
        ? value['sourceStepId']
        : null,
    target: validators.isScenarioTargetDescriptor(value['target']) ? value['target'] : null,
    data: parsedData,
  };
}
