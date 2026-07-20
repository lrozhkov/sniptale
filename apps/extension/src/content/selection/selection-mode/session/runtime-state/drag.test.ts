import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModePointerDragState } from './drag';

it('reads and writes the drag fields through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModePointerDragState(refs);

  refs.dragStartPoint = { x: 1, y: 2 };
  refs.hasMovedEnough = true;

  expect(state.dragStartPoint).toEqual({ x: 1, y: 2 });
  expect(state.hasMovedEnough).toBe(true);

  state.dragStartPoint = { x: 3, y: 4 };
  state.hasMovedEnough = false;

  expect(refs.dragStartPoint).toEqual({ x: 3, y: 4 });
  expect(refs.hasMovedEnough).toBe(false);
});
