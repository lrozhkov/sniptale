// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopupCommandPaletteHotkey } from './hotkey';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHook(props: Parameters<typeof usePopupCommandPaletteHotkey>[0]) {
  function Harness() {
    usePopupCommandPaletteHotkey(props);
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

function dispatchKeydown(
  options: Partial<KeyboardEventInit> & { target?: EventTarget | null } = {}
) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'k',
    ctrlKey: true,
    ...options,
  });

  if (options.target) {
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: options.target,
    });
  }

  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('usePopupCommandPaletteHotkey', () => {
  it('opens and closes the palette on Cmd/Ctrl+K', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook({ isOpen: false, onOpen, onClose });
    const openEvent = dispatchKeydown();

    expect(openEvent.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);

    renderHook({ isOpen: true, onOpen, onClose });
    dispatchKeydown({ metaKey: true, ctrlKey: false });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores disabled, prevented, modified, and editable-element key presses', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderHook({ isOpen: false, onOpen, onClose, enabled: false });
    dispatchKeydown();

    renderHook({ isOpen: false, onOpen, onClose });
    const preventedEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'k',
      ctrlKey: true,
    });
    preventedEvent.preventDefault();
    window.dispatchEvent(preventedEvent);

    dispatchKeydown({ altKey: true });
    dispatchKeydown({ shiftKey: true });
    dispatchKeydown({ target: input });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
