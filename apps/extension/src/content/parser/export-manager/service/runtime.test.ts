import { expect, it } from 'vitest';

import { getExportErrorMessage } from './runtime';

it('formats error messages from real Error instances and unknown values', () => {
  expect(getExportErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  expect(getExportErrorMessage('nope', 'fallback')).toBe('fallback');
});
