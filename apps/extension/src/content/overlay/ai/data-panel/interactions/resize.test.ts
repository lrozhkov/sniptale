// @vitest-environment jsdom

import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { resizeElement } from './resize';

function createMouseEvent(clientY: number) {
  return {
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

describe('resizeElement', () => {
  it('does not enter resizing mode when the target element is missing', () => {
    const setResizing = vi.fn();
    const event = createMouseEvent(100);

    resizeElement(event, null, setResizing);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(setResizing).not.toHaveBeenCalled();
  });

  it('updates element height and clears listeners on mouseup', () => {
    const setResizing = vi.fn();
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: 120,
    });
    const event = createMouseEvent(100);

    resizeElement(event, element, setResizing);
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 150 }));

    expect(element.style.height).toBe('170px');

    document.dispatchEvent(new MouseEvent('mouseup'));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 200 }));

    expect(setResizing).toHaveBeenLastCalledWith(false);
    expect(element.style.height).toBe('170px');
  });
});
