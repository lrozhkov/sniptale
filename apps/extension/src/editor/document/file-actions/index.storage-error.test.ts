import { expect, it } from 'vitest';

import { isEditorStoragePromptError } from './';

it('rejects generic runtime errors through the file-actions index export', () => {
  expect(isEditorStoragePromptError(new Error('boom'))).toBe(false);
});
