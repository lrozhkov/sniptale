import { expect, it } from 'vitest';

import { applyTableEdit as canonical } from './table';
import { applyTableEdit as facade } from './table';

it('keeps the table helper root as a thin facade', () => {
  expect(facade).toBe(canonical);
});
