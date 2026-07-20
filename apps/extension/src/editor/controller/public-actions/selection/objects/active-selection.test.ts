import { expect, it } from 'vitest';

import { getMutableEditorSelection } from './active-selection';

it('returns unlocked editable active objects', () => {
  const object = { sniptaleId: 'object', sniptaleLocked: false };
  const canvas = {
    getActiveObjects: () => [object],
  };

  expect(getMutableEditorSelection(canvas as never)).toEqual([object]);
});

it('rejects missing, empty, and locked selections', () => {
  expect(getMutableEditorSelection(null)).toBeNull();
  expect(getMutableEditorSelection({ getActiveObjects: () => [] } as never)).toBeNull();
  expect(
    getMutableEditorSelection({ getActiveObjects: () => [{ sniptaleLocked: true }] } as never)
  ).toBeNull();
});
