import { expect, it } from 'vitest';

import { cloneHistorySnapshot } from './clone';

it('returns the same primitive snapshot without wrapping', () => {
  expect(cloneHistorySnapshot('value')).toBe('value');
});

it('returns a detached clone for object snapshots', () => {
  const snapshot = { nested: { value: 'before' } };
  const cloned = cloneHistorySnapshot(snapshot);

  snapshot.nested.value = 'after';

  expect(cloned).toEqual({ nested: { value: 'before' } });
});
