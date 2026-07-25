// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFramePopoverPosition } from './popover-position';

let container: HTMLDivElement;
let root: Root;

function setRect(element: HTMLElement, rect: DOMRect) {
  element.getBoundingClientRect = vi.fn(() => rect);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function PositionHarness(props: {
  anchorEl: HTMLElement;
  fallbackHeight?: number;
  frameRect?: { x: number; y: number; width: number; height: number };
  layoutHeight?: number;
  transformedHeight?: number;
}) {
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const setPopoverRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      popoverRef.current = element;
      if (!element || props.layoutHeight === undefined) return;
      Object.defineProperties(element, {
        offsetHeight: { configurable: true, value: props.layoutHeight },
        offsetWidth: { configurable: true, value: 160 },
      });
      element.getBoundingClientRect = () =>
        new DOMRect(0, 0, 160, props.transformedHeight ?? props.layoutHeight);
    },
    [props.layoutHeight, props.transformedHeight]
  );
  const style = useFramePopoverPosition({
    anchorEl: props.anchorEl,
    fallbackSize: { width: 160, height: props.fallbackHeight ?? 80 },
    frameId: 'frame-1',
    frameRect: props.frameRect ?? { x: 200, y: 20, width: 200, height: 60 },
    isOpen: true,
    popoverRef,
  });

  return (
    <div
      ref={setPopoverRef}
      data-left={style.left}
      data-max-height={style.maxHeight}
      data-overflow={style.overflow}
      data-top={style.top}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('frame popover positioning', () => {
  it('keeps the popover outside both the selected frame and its stable toolbar', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar-portal-wrapper';
    toolbar.dataset['frameId'] = 'frame-1';
    toolbar.dataset['placementSide'] = 'bottom';
    setRect(toolbar, new DOMRect(200, 100, 200, 48));
    document.body.append(toolbar);

    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(250, 105, 24, 24));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    const left = Number(popover.dataset['left']);
    const top = Number(popover.dataset['top']);
    const popoverRect = { x: left, y: top, width: 160, height: 80 };
    expect(overlaps(popoverRect, { x: 200, y: 100, width: 200, height: 48 })).toBe(false);
    expect(overlaps(popoverRect, { x: 200, y: 20, width: 200, height: 60 })).toBe(false);
    expect(left).toBe(182);
    expect(top).toBeGreaterThanOrEqual(148);
  });

  it('flips the popover above its icon only when the canonical bottom side has no room', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar-portal-wrapper';
    toolbar.dataset['frameId'] = 'frame-1';
    setRect(toolbar, new DOMRect(200, 500, 200, 48));
    document.body.append(toolbar);

    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(250, 505, 24, 24));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    const left = Number(popover.dataset['left']);
    const top = Number(popover.dataset['top']);
    expect(left).toBe(182);
    expect(top + 80).toBeLessThanOrEqual(500);
  });

  it('uses untransformed layout height so an animated popover stays clear above the toolbar', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar-portal-wrapper';
    toolbar.dataset['frameId'] = 'frame-1';
    setRect(toolbar, new DOMRect(200, 500, 200, 48));
    document.body.append(toolbar);

    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(250, 505, 24, 24));
    toolbar.append(anchor);

    act(() =>
      root.render(
        <PositionHarness
          anchorEl={anchor}
          fallbackHeight={80}
          layoutHeight={220}
          transformedHeight={176}
        />
      )
    );

    const popover = container.firstElementChild as HTMLElement;
    const top = Number(popover.dataset['top']);
    expect(top).toBe(270);
    expect(top + 220).toBe(490);
  });

  it('keeps the canonical bottom side even when the selected frame is below the toolbar', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar-portal-wrapper';
    toolbar.dataset['frameId'] = 'frame-1';
    setRect(toolbar, new DOMRect(200, 100, 200, 48));
    document.body.append(toolbar);

    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(250, 105, 24, 24));
    toolbar.append(anchor);

    act(() =>
      root.render(
        <PositionHarness
          anchorEl={anchor}
          frameRect={{ x: 200, y: 160, width: 200, height: 100 }}
        />
      )
    );

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(182);
    expect(Number(popover.dataset['top'])).toBe(158);
  });

  it('keeps every family-sized popover at its natural height without internal scrolling', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar-portal-wrapper';
    toolbar.dataset['frameId'] = 'frame-1';
    setRect(toolbar, new DOMRect(200, 200, 200, 48));
    document.body.append(toolbar);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(250, 205, 24, 24));
    toolbar.append(anchor);

    [360, 440, 520].forEach((fallbackHeight) => {
      act(() => root.render(<PositionHarness anchorEl={anchor} fallbackHeight={fallbackHeight} />));
      const popover = container.firstElementChild as HTMLElement;
      const top = Number(popover.dataset['top']);
      expect(top).toBe(190 - fallbackHeight);
      expect(popover.dataset['maxHeight']).toBe('none');
      expect(popover.dataset['overflow']).toBe('visible');
    });
  });

  it('repositions after the toolbar layout changes', () => {
    const observed: Element[] = [];
    let notifyResize: (() => void) | undefined;
    let scheduledLayout: FrameRequestCallback | undefined;
    class ResizeObserverStub implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this);
      }
      observe(element: Element) {
        observed.push(element);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduledLayout = callback;
      return 17;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    let toolbarTop = 100;
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar-portal-wrapper';
    toolbar.dataset['frameId'] = 'frame-1';
    toolbar.getBoundingClientRect = vi.fn(() => new DOMRect(200, toolbarTop, 200, 48));
    document.body.append(toolbar);

    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(250, 105, 24, 24));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));
    const popover = container.firstElementChild as HTMLElement;
    expect(observed).toContain(toolbar);
    expect(observed).toContain(popover);
    expect(Number(popover.dataset['top'])).toBe(158);

    toolbarTop = 180;
    act(() => notifyResize?.());
    expect(Number(popover.dataset['top'])).toBe(158);
    act(() => scheduledLayout?.(0));

    expect(Number(popover.dataset['top'])).toBe(238);
  });
});
