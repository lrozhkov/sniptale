import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModeCoreSelectionState } from './core.selection';

it('reads and writes selection fields through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModeCoreSelectionState(refs);

  refs.currentSelection = { x: 11, y: 12, width: 130, height: 140 };
  refs.currentState = 'hover';

  expect(state.currentSelection).toEqual({ x: 11, y: 12, width: 130, height: 140 });
  expect(state.currentState).toBe('hover');

  state.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
  state.currentState = 'confirmed';

  expect(refs.currentSelection).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  expect(refs.currentState).toBe('confirmed');
});
