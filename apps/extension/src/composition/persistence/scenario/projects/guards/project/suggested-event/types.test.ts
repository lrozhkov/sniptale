import { expect, it } from 'vitest';

import type { SuggestedEventDataRecord, SuggestedEventValidators } from './types';

it('keeps suggested-event types available for local owner consumers', () => {
  const dataRecord: SuggestedEventDataRecord = {
    attempts: 2,
    ctrl: true,
  };
  const validators: SuggestedEventValidators = {
    hasOptionalField: () => true,
    isNullable:
      <T>(predicate: (value: unknown) => value is T) =>
      (value): value is T | null =>
        value === null || predicate(value),
    isNumber: (value): value is number => typeof value === 'number',
    isRecord: (value): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null,
    isScenarioStringDataRecord: (value): value is SuggestedEventDataRecord =>
      typeof value === 'object' && value !== null,
    isScenarioSuggestedEventKind: (value): value is 'click' => value === 'click',
    isScenarioTargetDescriptor: (value): value is never => value === null,
    isString: (value): value is string => typeof value === 'string',
  };

  expect(validators.isScenarioStringDataRecord(dataRecord)).toBe(true);
});
