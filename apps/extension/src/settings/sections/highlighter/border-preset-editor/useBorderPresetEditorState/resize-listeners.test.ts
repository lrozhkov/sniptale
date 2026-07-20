// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { beginBorderPresetResize } from './resize-listeners';

describe('beginBorderPresetResize', () => {
  it('attaches and removes document listeners for an active drag', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const clearResizeListeners = vi.fn();
    const setIsResizing = vi.fn();
    const setTextareaHeight = vi.fn();

    const cleanup = beginBorderPresetResize({
      clearResizeListeners,
      setIsResizing,
      setTextareaHeight,
      startY: 120,
      textareaHeight: 80,
    });

    expect(setIsResizing).toHaveBeenCalledWith(true);
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

    cleanup();

    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });
});
