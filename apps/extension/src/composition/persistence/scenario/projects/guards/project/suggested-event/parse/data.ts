import type { SuggestedEventDataRecord, SuggestedEventValidators } from '../types';

export function getSuggestedEventData(
  validators: SuggestedEventValidators,
  value: unknown
): SuggestedEventDataRecord {
  return validators.isScenarioStringDataRecord(value) ? value : {};
}
