import { expect, it } from 'vitest';

import { getSuggestedEventId } from './id';

it('keeps suggested-event ids stable with a deterministic fallback', () => {
  expect(getSuggestedEventId('event-3', 0)).toBe('event-3');
  expect(getSuggestedEventId('', 0)).toBe('scenario-event-1');
  expect(getSuggestedEventId(null, 2)).toBe('scenario-event-3');
});
