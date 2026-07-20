import { expect, it } from 'vitest';

import type { SuggestedEventValidators } from '../types';
import { getSuggestedEventData } from './data';

function createValidators(): SuggestedEventValidators {
  return {
    hasOptionalField: () => true,
    isNullable: (predicate) => (value) => value === null || predicate(value),
    isNumber: (value): value is number => typeof value === 'number',
    isRecord: (value): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null,
    isScenarioStringDataRecord: (
      value
    ): value is Record<string, string | number | boolean | null> =>
      typeof value === 'object' && value !== null,
    isScenarioSuggestedEventKind: (value): value is never => value === 'click',
    isScenarioTargetDescriptor: (value): value is never => value === null,
    isString: (value): value is string => typeof value === 'string',
  };
}

it('keeps suggested-event data payloads normalized', () => {
  const validators = createValidators();

  expect(getSuggestedEventData(validators, { attempts: 2 })).toEqual({ attempts: 2 });
  expect(getSuggestedEventData(validators, null)).toEqual({});
});
