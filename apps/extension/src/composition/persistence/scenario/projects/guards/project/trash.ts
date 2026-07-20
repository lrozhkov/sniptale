import { isNumber, isRecord } from '../../../../../../contracts/messaging/validators';
import { parseStep } from './step/parse';

export function parseTrashEntry(value: unknown) {
  if (!isRecord(value) || !isNumber(value['deletedAt']) || !isNumber(value['originalIndex'])) {
    return null;
  }

  const step = parseStep(value['step'], value['originalIndex']);
  if (!step) {
    return null;
  }

  return {
    deletedAt: value['deletedAt'],
    originalIndex: value['originalIndex'],
    step,
  };
}
