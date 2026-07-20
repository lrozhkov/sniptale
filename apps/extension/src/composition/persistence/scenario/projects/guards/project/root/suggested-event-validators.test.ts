import { expect, it } from 'vitest';

import { buildSuggestedEventValidators } from './suggested-event-validators';

it('builds the validator bundle used by suggested-event parsing', () => {
  const validators = buildSuggestedEventValidators();

  expect(validators).toMatchObject({
    hasOptionalField: expect.any(Function),
    isNullable: expect.any(Function),
    isNumber: expect.any(Function),
    isRecord: expect.any(Function),
    isScenarioStringDataRecord: expect.any(Function),
    isScenarioSuggestedEventKind: expect.any(Function),
    isScenarioTargetDescriptor: expect.any(Function),
    isString: expect.any(Function),
  });
});
