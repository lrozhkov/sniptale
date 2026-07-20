import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModePointerHoverState } from './hover';

it('reads and writes the hovered element through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModePointerHoverState(refs);
  const hoveredElement = {} as HTMLElement;

  refs.hoveredElement = hoveredElement;

  expect(state.hoveredElement).toBe(hoveredElement);

  const updatedHoveredElement = {} as HTMLElement;
  state.hoveredElement = updatedHoveredElement;

  expect(refs.hoveredElement).toBe(updatedHoveredElement);
});
