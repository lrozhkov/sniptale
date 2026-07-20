// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { addExitFrameEditingListener, dispatchExitFrameEditing } from './exit-frame-editing';

describe('mode-events exit-frame-editing family', () => {
  it('dispatches and subscribes to exit-frame-editing signals', () => {
    const listener = vi.fn();
    const cleanup = addExitFrameEditingListener(listener);

    dispatchExitFrameEditing();

    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
