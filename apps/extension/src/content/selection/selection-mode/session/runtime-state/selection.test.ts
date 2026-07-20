import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModePointerSelectionState } from './selection';

it('reads and writes the drag selection through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModePointerSelectionState(refs);

  refs.selectionAtDragStart = { x: 11, y: 12, width: 13, height: 14 };

  expect(state.selectionAtDragStart).toEqual({
    x: 11,
    y: 12,
    width: 13,
    height: 14,
  });

  state.selectionAtDragStart = { x: 15, y: 16, width: 17, height: 18 };

  expect(refs.selectionAtDragStart).toEqual({ x: 15, y: 16, width: 17, height: 18 });
});
