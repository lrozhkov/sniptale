// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { addContentModeDisabledListener, dispatchContentModeDisabled } from './mode-disabled';

describe('mode-events disabled family', () => {
  it('dispatches and subscribes to mode-disabled events', () => {
    const listener = vi.fn();
    const cleanup = addContentModeDisabledListener(listener);

    dispatchContentModeDisabled({ mode: 'quick-edit' });

    expect(listener).toHaveBeenCalledWith({ mode: 'quick-edit' });

    cleanup();
  });
});
