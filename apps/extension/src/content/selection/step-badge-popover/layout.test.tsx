// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStepBadgePopoverLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function LayoutHarness() {
  const getPopoverStyle = useStepBadgePopoverLayout(null);
  const style = getPopoverStyle();

  return (
    <div
      data-left={String(style.left)}
      data-pointer-events={String(style.pointerEvents)}
      data-top={String(style.top)}
      data-visibility={String(style.visibility)}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

describe('useStepBadgePopoverLayout', () => {
  it('keeps the popover hidden until an anchor element exists', () => {
    act(() => {
      root?.render(<LayoutHarness />);
    });

    const node = container?.firstElementChild;

    expect(node?.getAttribute('data-top')).toBe('0');
    expect(node?.getAttribute('data-left')).toBe('0');
    expect(node?.getAttribute('data-visibility')).toBe('hidden');
    expect(node?.getAttribute('data-pointer-events')).toBe('none');
  });
});
