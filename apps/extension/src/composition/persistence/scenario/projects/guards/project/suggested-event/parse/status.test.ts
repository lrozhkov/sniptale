import { expect, it } from 'vitest';

import { normalizeSuggestedEventStatus } from './status';

it('normalizes suggested-event status values to the supported set', () => {
  expect(normalizeSuggestedEventStatus('accepted')).toBe('accepted');
  expect(normalizeSuggestedEventStatus('dismissed')).toBe('dismissed');
  expect(normalizeSuggestedEventStatus('unknown')).toBe('pending');
  expect(normalizeSuggestedEventStatus(undefined)).toBe('pending');
});
