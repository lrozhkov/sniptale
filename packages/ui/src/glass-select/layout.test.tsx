// @vitest-environment jsdom

import { act, useRef } from 'react';
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

function LayoutHarness(props: {
  portal: boolean;
  isOpen: boolean;
  placement?: 'auto' | 'bottom';
  menuWidth?: number;
}) {
  const containerRef = useRef(document.getElementById('select-root') as HTMLDivElement | null);
  const menuRef = useRef(document.getElementById('menu-root') as HTMLDivElement | null);
  const { menuPosition, portalStyle } = useGlassSelectLayout({
    portal: props.portal,
    isOpen: props.isOpen,
    containerRef,
    menuRef,
    ...(props.placement === undefined ? {} : { placement: props.placement }),
    ...(props.menuWidth === undefined ? {} : { menuWidth: props.menuWidth }),
  });

  return (
    <div
      data-testid="layout-state"
      data-position={menuPosition}
      data-top={String(portalStyle.top ?? '')}
      data-left={String(portalStyle.left ?? '')}
      data-width={String(portalStyle.width ?? '')}
    />
  );
}

function renderHarness(
  props: { portal: boolean; isOpen: boolean; placement?: 'auto' | 'bottom'; menuWidth?: number },
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
  const mount = document.createElement('div');
  container.appendChild(mount);
  root = createRoot(mount);

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

  it('keeps an explicitly bottom-anchored portal below the trigger in a cramped viewport', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 });
    const layout = renderHarness(
      { portal: true, isOpen: true, placement: 'bottom' },
      { top: 320, bottom: 380, left: 24, width: 260, height: 60 },
      140
    );

    expect(layout?.dataset['position']).toBe('bottom');
    expect(layout?.dataset['top']).toBe('388');
    expect(layout?.dataset['left']).toBe('24');
  });
});

describe('explicit menu width', () => {
  it.each([
    { left: 2, expected: 8 },
    { left: 950, expected: 632 },
  ])('fits a 360px menu beside a 40px trigger at x=$left', ({ left, expected }) => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    const layout = renderHarness(
      { portal: true, isOpen: true, menuWidth: 360 },
      { top: 100, bottom: 124, left, width: 40, height: 24 },
      200
    );
    expect(layout?.dataset['width']).toBe('360');
    expect(layout?.dataset['left']).toBe(String(expected));
    expect(layout?.dataset['top']).toBe('132');
  });

  it('recomputes width and wrapped height when the viewport shrinks', () => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    const layout = renderHarness(
      { portal: true, isOpen: true, menuWidth: 360 },
      { top: 500, bottom: 524, left: 600, width: 40, height: 24 },
      200
    );
    expect(layout?.dataset['width']).toBe('360');
    const menu = container!.querySelector<HTMLDivElement>('#menu-root')!;
    setMenuOffsetHeight(menu, 380);
    vi.stubGlobal('innerWidth', 300);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(layout?.dataset['width']).toBe('284');
    expect(layout?.dataset['left']).toBe('8');
    expect(layout?.dataset['position']).toBe('top');
    expect(layout?.dataset['top']).toBe('112');
  });

  it('remeasures an open menu after its content height changes without a window event', () => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    let notifyMenuResize: (() => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notifyMenuResize = callback;
        }
        observe = observe;
        unobserve() {}
        disconnect = disconnect;
      }
    );
    const layout = renderHarness(
      { portal: true, isOpen: true, menuWidth: 360 },
      { top: 500, bottom: 524, left: 100, width: 40, height: 24 },
      200
    );
    const menu = container!.querySelector<HTMLDivElement>('#menu-root')!;
    setMenuOffsetHeight(menu, 350);
    expect(notifyMenuResize).toBeDefined();
    act(() => notifyMenuResize?.());
    expect(layout?.dataset['position']).toBe('top');
    expect(layout?.dataset['top']).toBe('142');
    expect(observe).toHaveBeenCalledWith(menu);
    act(() => root?.render(<LayoutHarness portal isOpen={false} menuWidth={360} />));
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('preserves trigger width and alignment when no menu width is supplied', () => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    const layout = renderHarness(
      { portal: true, isOpen: true },
      { top: 100, bottom: 124, left: 2, width: 40, height: 24 },
      200
    );
    expect(layout?.dataset['width']).toBe('40');
    expect(layout?.dataset['left']).toBe('2');
  });
});
