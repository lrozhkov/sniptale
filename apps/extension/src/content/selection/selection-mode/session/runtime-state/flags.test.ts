import { describe, expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModeInteractionState } from './flags';

describe('selection-mode runtime-state interaction slice', () => {
  it('reads and writes the interaction fields through the mutable refs proxy', () => {
    const refs = createMutableRefs();
    const state = createSelectionModeInteractionState(refs);

    refs.isDragging = true;
    refs.isResizing = true;
    refs.maintainAspectRatio = true;
    refs.skipNextClick = true;

    expect(state.isDragging).toBe(true);
    expect(state.isResizing).toBe(true);
    expect(state.maintainAspectRatio).toBe(true);
    expect(state.skipNextClick).toBe(true);

    state.isDragging = false;
    state.isResizing = false;
    state.maintainAspectRatio = false;
    state.skipNextClick = false;

    expect(refs.isDragging).toBe(false);
    expect(refs.isResizing).toBe(false);
    expect(refs.maintainAspectRatio).toBe(false);
    expect(refs.skipNextClick).toBe(false);
  });
});
