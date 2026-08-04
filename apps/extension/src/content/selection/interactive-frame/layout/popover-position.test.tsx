// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFramePopoverPosition } from './popover-position';

let container: HTMLDivElement;
let root: Root;

function setRect(element: Element, rect: DOMRect) {
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
  isOpen?: boolean;
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
    isOpen: props.isOpen ?? true,
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

describe('main toolbar frame popover positioning', () => {
  it('opens below the complete horizontal main toolbar without overlapping it', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar';
    toolbar.dataset['displayMode'] = 'horizontal';
    setRect(toolbar, new DOMRect(100, 100, 420, 48));
    document.body.append(toolbar);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(220, 108, 32, 32));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(220);
    expect(Number(popover.dataset['top'])).toBe(150);
    expect(Number(popover.dataset['top']) - 140).toBe(10);
  });

  it('opens beside the complete vertical main toolbar without overlapping it', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar';
    toolbar.dataset['displayMode'] = 'vertical';
    setRect(toolbar, new DOMRect(100, 80, 48, 360));
    document.body.append(toolbar);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(108, 180, 32, 32));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(150);
    expect(Number(popover.dataset['left']) - 140).toBe(10);
    expect(Number(popover.dataset['top'])).toBe(180);
  });

  it('opens above a horizontal main toolbar when there is no room below it', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar';
    toolbar.dataset['displayMode'] = 'horizontal';
    setRect(toolbar, new DOMRect(100, 530, 420, 48));
    document.body.append(toolbar);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(220, 538, 32, 32));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(220);
    expect(Number(popover.dataset['top'])).toBe(448);
    expect(538 - (Number(popover.dataset['top']) + 80)).toBe(10);
  });

  it('opens left of a vertical main toolbar when there is no room on its right', () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar';
    toolbar.dataset['displayMode'] = 'vertical';
    setRect(toolbar, new DOMRect(730, 80, 48, 360));
    document.body.append(toolbar);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(738, 180, 32, 32));
    toolbar.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(568);
    expect(738 - (Number(popover.dataset['left']) + 160)).toBe(10);
    expect(Number(popover.dataset['top'])).toBe(180);
  });
});

describe('frame toolbar popover positioning', () => {
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
    expect(top).toBe(152);
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
    expect(top).toBe(276);
    expect(top + 220).toBe(496);
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
    expect(Number(popover.dataset['top'])).toBe(152);
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
      expect(top).toBe(196 - fallbackHeight);
      expect(popover.dataset['maxHeight']).toBe('none');
      expect(popover.dataset['overflow']).toBe('visible');
    });
  });

  it('keeps its opening position when the annotation toolbar moves underneath it', () => {
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
    expect(Number(popover.dataset['top'])).toBe(152);

    toolbarTop = 180;
    act(() => notifyResize?.());
    expect(Number(popover.dataset['top'])).toBe(152);
    act(() => scheduledLayout?.(0));

    expect(Number(popover.dataset['top'])).toBe(152);
  });

  it('opens a quick-control popover to the right and keeps that position fixed', () => {
    let anchorTop = 105;
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = vi.fn(() => new DOMRect(250, anchorTop, 24, 24));
    document.body.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));
    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(284);
    expect(Number(popover.dataset['top'])).toBe(77);

    anchorTop = 285;
    act(() =>
      root.render(
        <PositionHarness anchorEl={anchor} frameRect={{ x: 300, y: 280, width: 200, height: 60 }} />
      )
    );

    expect(Number(popover.dataset['left'])).toBe(284);
    expect(Number(popover.dataset['top'])).toBe(77);
  });

  it('opens a quick-control popover to the left when the right side has no room', () => {
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(760, 105, 24, 24));
    document.body.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(590);
    expect(Number(popover.dataset['top'])).toBe(77);
  });

  it('uses the canonical vertical fallback when neither quick-control side fits', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(200);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(88, 105, 24, 24));
    document.body.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(20);
    expect(Number(popover.dataset['top'])).toBe(139);
  });

  it('starts a fresh placement session when the popover is reopened', () => {
    let anchorTop = 105;
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = vi.fn(() => new DOMRect(250, anchorTop, 24, 24));
    document.body.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));
    expect(Number((container.firstElementChild as HTMLElement).dataset['left'])).toBe(284);
    expect(Number((container.firstElementChild as HTMLElement).dataset['top'])).toBe(77);

    act(() => root.render(<PositionHarness anchorEl={anchor} isOpen={false} />));
    anchorTop = 285;
    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    expect(Number((container.firstElementChild as HTMLElement).dataset['left'])).toBe(284);
    expect(Number((container.firstElementChild as HTMLElement).dataset['top'])).toBe(257);
  });
});

describe('callout-aware popover positioning', () => {
  it('keeps callout settings outside the callout and its connector when space permits', () => {
    const callout = document.createElement('div');
    callout.className = 'sniptale-callout';
    callout.dataset['frameId'] = 'frame-1';
    setRect(callout, new DOMRect(200, 80, 200, 120));
    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connector.classList.add('sniptale-callout-dynamic-tail');
    setRect(connector, new DOMRect(180, 60, 240, 180));
    callout.append(connector);
    document.body.append(callout);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(400, 90, 20, 20));
    document.body.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));

    const popover = container.firstElementChild as HTMLElement;
    const popoverRect = {
      x: Number(popover.dataset['left']),
      y: Number(popover.dataset['top']),
      width: 160,
      height: 80,
    };
    expect(popoverRect.x).toBe(430);
    expect(overlaps(popoverRect, { x: 180, y: 60, width: 240, height: 180 })).toBe(false);
  });

  it('keeps the settings panel fixed until the moved callout actually overlaps it', () => {
    let calloutRect = new DOMRect(200, 80, 200, 120);
    const callout = document.createElement('div');
    callout.className = 'sniptale-callout';
    callout.dataset['frameId'] = 'frame-1';
    callout.getBoundingClientRect = vi.fn(() => calloutRect);
    document.body.append(callout);
    const anchor = document.createElement('button');
    setRect(anchor, new DOMRect(400, 90, 20, 20));
    document.body.append(anchor);

    act(() => root.render(<PositionHarness anchorEl={anchor} />));
    const popover = container.firstElementChild as HTMLElement;
    expect(Number(popover.dataset['left'])).toBe(430);

    calloutRect = new DOMRect(100, 300, 180, 100);
    act(() =>
      root.render(
        <PositionHarness
          anchorEl={anchor}
          frameRect={{ x: 100, y: 300, width: 180, height: 100 }}
        />
      )
    );
    expect(Number(popover.dataset['left'])).toBe(430);
    expect(Number(popover.dataset['top'])).toBe(100);

    calloutRect = new DOMRect(425, 70, 165, 120);
    act(() =>
      root.render(
        <PositionHarness anchorEl={anchor} frameRect={{ x: 425, y: 70, width: 165, height: 120 }} />
      )
    );
    expect(Number(popover.dataset['left'])).toBe(600);
    expect(
      overlaps(
        {
          x: Number(popover.dataset['left']),
          y: Number(popover.dataset['top']),
          width: 160,
          height: 80,
        },
        { x: 425, y: 70, width: 165, height: 120 }
      )
    ).toBe(false);
  });
});
