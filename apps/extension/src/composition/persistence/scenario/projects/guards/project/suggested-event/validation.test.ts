import { expect, it } from 'vitest';

import { hasSuggestedEventShape } from './validation';
import type { SuggestedEventValidators } from './types';

function createValidators(): SuggestedEventValidators {
  return {
    hasOptionalField: (value, key, predicate) =>
      Object.prototype.hasOwnProperty.call(value, key) ? predicate(value[key]) : true,
    isNullable:
      <T>(predicate: (value: unknown) => value is T) =>
      (value: unknown): value is T | null =>
        value === null || predicate(value),
    isNumber: (value): value is number => typeof value === 'number',
    isRecord: (value): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null,
    isScenarioStringDataRecord: (
      value
    ): value is Record<string, string | number | boolean | null> =>
      typeof value === 'object' && value !== null,
    isScenarioSuggestedEventKind: (value): value is 'click' => value === 'click',
    isScenarioTargetDescriptor: (value): value is never => value === null,
    isString: (value): value is string => typeof value === 'string',
  };
}

it('accepts the persisted event shape used by scenario projects', () => {
  expect(
    hasSuggestedEventShape(
      {
        createdAt: 40,
        data: { attempts: 2 },
        id: 'event-1',
        kind: 'click',
        message: 'Clicked CTA',
        sourceStepId: 'capture-1',
        status: 'pending',
        target: null,
      },
      createValidators()
    )
  ).toBe(true);
});

it('rejects malformed suggested events early', () => {
  expect(
    hasSuggestedEventShape(
      {
        createdAt: 'now',
        id: 'event-1',
        kind: 'click',
        message: 'Clicked CTA',
        status: 'pending',
      } as Record<string, unknown>,
      createValidators()
    )
  ).toBe(false);
});
