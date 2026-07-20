import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModePointerInteractionState } from './interaction';

it('reads and writes the interaction fields through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModePointerInteractionState(refs);

  refs.isActive = true;
  refs.mouseDownPoint = { x: 7, y: 8 };
  refs.resizeDirection = 'se';

  expect(state.isActive).toBe(true);
  expect(state.mouseDownPoint).toEqual({ x: 7, y: 8 });
  expect(state.resizeDirection).toBe('se');

  state.isActive = false;
  state.mouseDownPoint = { x: 9, y: 10 };
  state.resizeDirection = 'nw';

  expect(refs.isActive).toBe(false);
  expect(refs.mouseDownPoint).toEqual({ x: 9, y: 10 });
  expect(refs.resizeDirection).toBe('nw');
});
