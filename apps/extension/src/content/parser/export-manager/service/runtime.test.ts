import { expect, it } from 'vitest';

import { getExportErrorMessage } from './runtime';

it('formats errors as localized UI copy without exposing raw values', () => {
  const errorMessage = getExportErrorMessage(new Error('boom'), 'content.runtime.exportFailed');
  expect(errorMessage).not.toContain('boom');
  expect(errorMessage).toContain('Sniptale');
  expect(getExportErrorMessage('nope', 'content.runtime.exportFailed')).not.toContain('nope');
});
