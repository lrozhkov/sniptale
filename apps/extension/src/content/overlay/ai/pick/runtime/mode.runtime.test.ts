// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { addContentModeDisabledListener } from '../../../../platform/page-context/mode-events';
import { createAiPickModeState, createKeyDownHandler } from './mode.runtime';

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

    handler({
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(disable).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ mode: 'ai-pick' });

    cleanup();
  });

  it('ignores keyboard events while ai-pick mode is disabled', () => {
    const state = createAiPickModeState();
    const disable = vi.fn();
    const handler = createKeyDownHandler(state, disable);

    handler({
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(disable).not.toHaveBeenCalled();
  });
});
