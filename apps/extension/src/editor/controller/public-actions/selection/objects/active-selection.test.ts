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

it('rejects mixed ancestry and mutations beneath a hidden or locked parent', () => {
  const parent = { sniptaleId: 'parent', sniptaleLocked: false, visible: true };
  const child = { sniptaleId: 'child', parent };
  expect(
    getMutableEditorSelection({ getActiveObjects: () => [parent, child] } as never)
  ).toBeNull();
  expect(getMutableEditorSelection({ getActiveObjects: () => [child] } as never)).toEqual([child]);
  parent.sniptaleLocked = true;
  expect(getMutableEditorSelection({ getActiveObjects: () => [child] } as never)).toBeNull();
  parent.sniptaleLocked = false;
  parent.visible = false;
  expect(getMutableEditorSelection({ getActiveObjects: () => [child] } as never)).toBeNull();
});
