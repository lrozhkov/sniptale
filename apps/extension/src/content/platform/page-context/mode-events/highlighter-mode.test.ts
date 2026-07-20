// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addHighlighterModeChangedListener,
  dispatchHighlighterModeChanged,
} from './highlighter-mode';

describe('mode-events highlighter family', () => {
  it('dispatches and subscribes to highlighter-mode events', () => {
    const listener = vi.fn();
    const cleanup = addHighlighterModeChangedListener(listener);

    dispatchHighlighterModeChanged({ enabled: false });

    expect(listener).toHaveBeenCalledWith({ enabled: false });

    cleanup();
  });
});
