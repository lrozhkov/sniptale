// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PresetRowShell } from './shell';

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
    onHoverChange: vi.fn(),
    presetId: 'preset-1',
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

it('binds hover events to the preset id', () => {
  const props = renderShell();
  const shell = container?.firstElementChild as HTMLDivElement | null;

  act(() => {
    shell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    shell?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });

  expect(props.onHoverChange).toHaveBeenNthCalledWith(1, 'preset-1');
  expect(props.onHoverChange).toHaveBeenNthCalledWith(2, null);
  expect(shell?.className).toBe('row-shell');
});
