import { expect, it } from 'vitest';

import { applyCommentEdit as canonical } from './comment';
import { applyCommentEdit as facade } from './comment';

it('keeps the comment helper root as a thin facade', () => {
  expect(facade).toBe(canonical);
});
