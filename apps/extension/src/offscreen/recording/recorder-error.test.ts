import { expect, it } from 'vitest';

import { getMediaRecorderError } from './recorder-error';

it('returns the recorder error carried by an event-like value', () => {
  const error = new Error('recorder failed');

  expect(getMediaRecorderError({ error }, 'fallback')).toBe(error);
});

it('falls back when an event-like value does not carry an Error', () => {
  expect(getMediaRecorderError({ error: 'failed' }, 'fallback')).toEqual(new Error('fallback'));
  expect(getMediaRecorderError(null, 'fallback')).toEqual(new Error('fallback'));
});
