import { expect, it } from 'vitest';

import { getDeleteTargetId } from './delete';

it('returns the selected delete target id', () => {
  expect(
    getDeleteTargetId({
      type: 'provider',
      item: { id: 'provider-1' } as never,
    })
  ).toBe('provider-1');
});
