// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorProjectHistoryShortcuts } from './history-shortcuts';

function Harness(props: {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}) {
  useVideoEditorProjectHistoryShortcuts({
    enabled: true,
    status: { canUndo: props.canUndo, canRedo: props.canRedo, error: null },
    undo: props.undo,
    redo: props.redo,
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('routes standard undo and redo shortcuts and leaves editable targets native', () => {
  const undo = vi.fn();
  const redo = vi.fn();
  act(() => root.render(<Harness canUndo canRedo undo={undo} redo={redo} />));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyZ', metaKey: true, shiftKey: true })
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', ctrlKey: true }));
  });

  const input = document.createElement('input');
  document.body.appendChild(input);
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'KeyZ', ctrlKey: true })
    );
  });
  input.remove();

  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).toHaveBeenCalledTimes(2);
});

it('does not consume unavailable history commands', () => {
  const undo = vi.fn();
  const redo = vi.fn();
  act(() => root.render(<Harness canUndo={false} canRedo={false} undo={undo} redo={redo} />));
  const event = new KeyboardEvent('keydown', {
    cancelable: true,
    code: 'KeyZ',
    ctrlKey: true,
  });

  act(() => window.dispatchEvent(event));

  expect(event.defaultPrevented).toBe(false);
  expect(undo).not.toHaveBeenCalled();
  expect(redo).not.toHaveBeenCalled();
});
