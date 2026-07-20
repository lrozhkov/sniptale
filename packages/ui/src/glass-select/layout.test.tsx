// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlassSelectLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

interface RectShape {
  top: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

function setMenuOffsetHeight(element: HTMLDivElement, value: number) {
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    value,
  });
}

function stubRect(element: HTMLDivElement, rect: RectShape) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.bottom,
    left: rect.left,
    toJSON: () => ({}),
  } as DOMRect);
}

function LayoutHarness(props: { portal: boolean; isOpen: boolean }) {
  const containerRef = { current: document.getElementById('select-root') as HTMLDivElement | null };
  const menuRef = { current: document.getElementById('menu-root') as HTMLDivElement | null };
  const { menuPosition, portalStyle } = useGlassSelectLayout({
    portal: props.portal,
    isOpen: props.isOpen,
    containerRef,
    menuRef,
  });

  return (
    <div
      data-testid="layout-state"
      data-position={menuPosition}
      data-top={String(portalStyle.top ?? '')}
      data-left={String(portalStyle.left ?? '')}
    />
  );
}

function renderHarness(
  props: { portal: boolean; isOpen: boolean },
  rect: RectShape,
  height: number
) {
  container = document.createElement('div');
  container.innerHTML = '<div id="select-root"></div><div id="menu-root"></div>';
  document.body.appendChild(container);
  const selectRoot = container.querySelector<HTMLDivElement>('#select-root');
  const menuRoot = container.querySelector<HTMLDivElement>('#menu-root');
  if (!selectRoot || !menuRoot) {
    throw new Error('Layout roots are missing');
  }

  stubRect(selectRoot, rect);
  setMenuOffsetHeight(menuRoot, height);
  root = createRoot(container);

  act(() => {
    root?.render(<LayoutHarness {...props} />);
  });

  return container.querySelector<HTMLElement>('[data-testid="layout-state"]');
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

describe('useGlassSelectLayout', () => {
  it('keeps bottom placement without portal when there is enough space below', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const layout = renderHarness(
      { portal: false, isOpen: true },
      { top: 120, bottom: 180, left: 40, width: 240, height: 60 },
      120
    );

    expect(layout?.dataset['position']).toBe('bottom');
    expect(layout?.dataset['top']).toBe('');
    expect(layout?.dataset['left']).toBe('');
  });

  it('switches to top placement and computes portal style when space below is tight', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 });
    const layout = renderHarness(
      { portal: true, isOpen: true },
      { top: 320, bottom: 380, left: 24, width: 260, height: 60 },
      140
    );

    expect(layout?.dataset['position']).toBe('top');
    expect(layout?.dataset['top']).toBe('172');
    expect(layout?.dataset['left']).toBe('24');
  });
});
