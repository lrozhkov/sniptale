// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PresetRowShell } from './preset-row-shell';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderShell() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = {
    children: <span>preset</span>,
    className: 'row-shell',
    presetId: 'preset-1',
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onHoverChange: vi.fn(),
  };

  act(() => {
    root?.render(<PresetRowShell {...props} />);
  });

  return props;
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

it('binds drag and hover events to the preset id', () => {
  const props = renderShell();
  const shell = container?.firstElementChild as HTMLDivElement | null;

  act(() => {
    shell?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    shell?.dispatchEvent(new Event('dragover', { bubbles: true }));
    shell?.dispatchEvent(new Event('drop', { bubbles: true }));
    shell?.dispatchEvent(new Event('dragend', { bubbles: true }));
    shell?.dispatchEvent(new Event('dragleave', { bubbles: true }));
    shell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    shell?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });

  expect(props.onDragStart).toHaveBeenCalledTimes(1);
  expect(props.onDragStart.mock.calls[0]?.[0]).toHaveProperty('type', 'dragstart');
  expect(props.onDragOver).toHaveBeenCalledTimes(1);
  expect(props.onDragOver.mock.calls[0]?.[0]).toHaveProperty('type', 'dragover');
  expect(props.onDrop).toHaveBeenCalledTimes(1);
  expect(props.onDrop.mock.calls[0]?.[0]).toHaveProperty('type', 'drop');
  expect(props.onDragEnd).toHaveBeenCalledTimes(1);
  expect(props.onDragLeave).toHaveBeenCalledTimes(1);
  expect(props.onHoverChange).toHaveBeenNthCalledWith(1, 'preset-1');
  expect(props.onHoverChange).toHaveBeenNthCalledWith(2, null);
  expect(shell?.className).toBe('row-shell');
  expect(shell?.textContent).toBe('preset');
});
