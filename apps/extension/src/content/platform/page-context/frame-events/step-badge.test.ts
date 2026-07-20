// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addFrameStepBadgeChangedListener,
  addStepBadgeReorderListener,
  dispatchFrameStepBadgeChanged,
  dispatchStepBadgeReorder,
} from './step-badge';

describe('frame-events step badge family', () => {
  it('dispatches and subscribes to step badge changes and reorder events', () => {
    const changeListener = vi.fn();
    const reorderListener = vi.fn();
    const cleanupChange = addFrameStepBadgeChangedListener(changeListener);
    const cleanupReorder = addStepBadgeReorderListener(reorderListener);

    dispatchFrameStepBadgeChanged({
      frameId: 'frame-1',
      settings: { enabled: true, value: 'A' },
    });
    dispatchStepBadgeReorder({ direction: 'down', frameId: 'frame-2' });

    expect(changeListener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: { enabled: true, value: 'A' },
    });
    expect(reorderListener).toHaveBeenCalledWith({ direction: 'down', frameId: 'frame-2' });

    cleanupChange();
    cleanupReorder();
  });
});
