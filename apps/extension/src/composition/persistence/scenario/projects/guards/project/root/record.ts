import { isNumber, isRecord, isString } from '../../../../../../../contracts/messaging/validators';

type PersistedScenarioProjectRecord = {
  createdAt: number;
  id: string;
  name: string;
  suggestedEvents: unknown[];
  tags?: string[];
  steps: unknown[];
  trash?: unknown[];
  updatedAt: number;
};

export function isPersistedScenarioProjectRecord(
  value: unknown
): value is PersistedScenarioProjectRecord {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt']) &&
    ((Array.isArray(value['tags']) && value['tags'].every(isString)) ||
      value['tags'] === undefined) &&
    Array.isArray(value['steps']) &&
    (Array.isArray(value['trash']) || value['trash'] === undefined) &&
    Array.isArray(value['suggestedEvents'])
  );
}
