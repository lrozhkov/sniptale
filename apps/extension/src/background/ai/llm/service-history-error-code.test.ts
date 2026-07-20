import { expect, it } from 'vitest';

import { resolveRequestHistoryErrorCode } from './service-history';

it.each([
  ['model missing', 'model-missing'],
  ['model selected', 'model-missing'],
  ['модель выбрана', 'model-missing'],
  ['invalid provider response', 'provider-invalid-response'],
  ['JSON response', 'provider-invalid-response'],
  ['parse failure', 'provider-invalid-response'],
  ['schema mismatch', 'provider-invalid-response'],
  ['transport timeout', 'provider-failure'],
] as const)('classifies the history-safe error code for %s', (error, expected) => {
  expect(resolveRequestHistoryErrorCode(error)).toBe(expected);
});

it('normalizes structured, Error, and non-message failures without retaining raw text', () => {
  expect(resolveRequestHistoryErrorCode({ error: 'schema mismatch' })).toBe(
    'provider-invalid-response'
  );
  expect(resolveRequestHistoryErrorCode(new Error('transport timeout'))).toBe('provider-failure');
  expect(resolveRequestHistoryErrorCode({ error: 42 })).toBe('unknown');
  expect(resolveRequestHistoryErrorCode(null)).toBe('unknown');
});
