// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCommandPaletteHotkey } from './hotkey';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function HotkeyHarness(props: {
  enabled?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  useCommandPaletteHotkey(props);
  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderHarness(
  props: {
    enabled?: boolean;
    isOpen?: boolean;
    onClose?: () => void;
    onOpen?: () => void;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  const nextProps = {
    enabled: true,
    isOpen: false,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    ...props,
  };

  await act(async () => {
    root?.render(<HotkeyHarness {...nextProps} />);
  });
  await flushEffects();

  return nextProps;
}

function dispatchCommandPaletteShortcut(
  target: EventTarget = window,
  overrides: KeyboardEventInit = {}
) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: 'k',
    ...overrides,
  });
  target.dispatchEvent(event);
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('opens and closes the palette on the command shortcut', async () => {
  const openProps = await renderHarness();
  const openEvent = dispatchCommandPaletteShortcut(window);

  expect(openProps.onOpen).toHaveBeenCalled();
  expect(openEvent.defaultPrevented).toBe(true);

  const closeProps = await renderHarness({ isOpen: true });
  const closeEvent = dispatchCommandPaletteShortcut(window);

  expect(closeProps.onClose).toHaveBeenCalled();
  expect(closeEvent.defaultPrevented).toBe(true);
});

it('opens the palette from the same physical shortcut on Cyrillic layout', async () => {
  const props = await renderHarness();
  dispatchCommandPaletteShortcut(window, { code: 'KeyK', key: 'л' });

  expect(props.onOpen).toHaveBeenCalled();
});

it('ignores shortcuts when disabled, modified, or coming from editable elements', async () => {
  const props = await renderHarness({ enabled: false });
  dispatchCommandPaletteShortcut(window);
  dispatchCommandPaletteShortcut(window, { altKey: true });

  const input = document.createElement('input');
  document.body.append(input);
  await renderHarness();
  dispatchCommandPaletteShortcut(input);

  expect(props.onOpen).not.toHaveBeenCalled();
});

it('ignores prevented events and cleans up listeners on rerender', async () => {
  const props = await renderHarness();
  const preventedEvent = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: 'k',
  });
  Object.defineProperty(preventedEvent, 'defaultPrevented', {
    get: () => true,
  });
  window.dispatchEvent(preventedEvent);
  expect(props.onOpen).not.toHaveBeenCalled();

  await renderHarness({ enabled: false, onOpen: props.onOpen });
  dispatchCommandPaletteShortcut(window);

  expect(props.onOpen).not.toHaveBeenCalled();
});
