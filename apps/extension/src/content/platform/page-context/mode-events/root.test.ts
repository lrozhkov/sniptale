// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addContentModeDisabledListener,
  addExitFrameEditingListener,
  addHighlighterModeChangedListener,
  dispatchContentModeDisabled,
  dispatchExitFrameEditing,
  dispatchHighlighterModeChanged,
} from '.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content mode events', () => {
  it('dispatches mode-disabled detail through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addContentModeDisabledListener(listener);

    dispatchContentModeDisabled({ mode: 'quick-edit' });

    expect(listener).toHaveBeenCalledWith({ mode: 'quick-edit' });

    cleanup();
  });

  it('dispatches highlighter-mode changes through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addHighlighterModeChangedListener(listener);

    dispatchHighlighterModeChanged({ enabled: false });

    expect(listener).toHaveBeenCalledWith({ enabled: false });

    cleanup();
  });

  it('dispatches exit-frame-editing through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addExitFrameEditingListener(listener);

    dispatchExitFrameEditing();

    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('removes listeners through the returned cleanup', () => {
    const listener = vi.fn();
    const cleanup = addContentModeDisabledListener(listener);

    cleanup();
    dispatchContentModeDisabled({ mode: 'ai-pick' });

    expect(listener).not.toHaveBeenCalled();
  });
});
