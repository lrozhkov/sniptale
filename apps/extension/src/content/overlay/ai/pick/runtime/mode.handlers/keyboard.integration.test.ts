// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { addContentModeDisabledListener } from '../../../../../platform/page-context/mode-events';
import { createAiPickModeState } from '../mode.state';
import { createKeyDownHandler } from './keyboard';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ai pick mode runtime keyboard handling', () => {
  it('disables ai-pick mode and emits the shared mode-disabled event on Escape', () => {
    const state = createAiPickModeState();
    state.isEnabled = true;
    const disable = vi.fn();
    const listener = vi.fn();
    const cleanup = addContentModeDisabledListener(listener);
    const handler = createKeyDownHandler(state, disable);

    handler(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));

    expect(disable).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ mode: 'ai-pick' });

    cleanup();
  });

  it('ignores keyboard events while ai-pick mode is disabled', () => {
    const state = createAiPickModeState();
    const disable = vi.fn();
    const handler = createKeyDownHandler(state, disable);

    handler(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));

    expect(disable).not.toHaveBeenCalled();
  });
});
