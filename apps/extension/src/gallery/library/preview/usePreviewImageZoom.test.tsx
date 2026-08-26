// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyntheticEvent } from 'react';
import { usePreviewImageZoom } from './usePreviewImageZoom';

const resizeObserverState = vi.hoisted(() => ({
  callback: null as ResizeObserverCallback | null,
  disconnect: vi.fn(),
}));

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverState.callback = callback;
  }

  observe() {}

  disconnect() {
    resizeObserverState.disconnect();
  }
}

function triggerResize() {
  resizeObserverState.callback?.([], {} as ResizeObserver);
}

function createImageLoadEvent(width: number, height: number) {
  return {
    currentTarget: {
      height,
      naturalHeight: width === 0 ? 0 : height,
      naturalWidth: width,
      width: width === 0 ? 300 : width,
    },
  } as SyntheticEvent<HTMLImageElement>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof usePreviewImageZoom> | null = null;

function HookProbe(props: {
  enabled: boolean;
  naturalSize?: { height: number; width: number } | null;
  resetKey: string | null;
}) {
  latestValue = usePreviewImageZoom(props.enabled, props.resetKey, props.naturalSize ?? null);
  return <div ref={latestValue.viewport.containerRef} data-ui="preview.zoom.container" />;
}

function renderHook(props: {
  enabled: boolean;
  naturalSize?: { height: number; width: number } | null;
  resetKey: string | null;
}) {
  act(() => {
    root?.render(<HookProbe {...props} />);
  });

  if (!latestValue) {
    throw new Error('Expected preview image zoom value');
  }

  return latestValue;
}

function setContainerSize(width: number, height: number) {
  const element = container?.querySelector('[data-ui="preview.zoom.container"]');

  if (!(element instanceof HTMLDivElement)) {
    throw new Error('Expected preview zoom container');
  }

  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });

  return element;
}

function dispatchWheel(
  element: HTMLDivElement,
  options: WheelEventInit = { cancelable: true, deltaY: -100 }
) {
  const wheelEvent = new WheelEvent('wheel', options);

  act(() => {
    element.dispatchEvent(wheelEvent);
  });

  return wheelEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestValue = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
  resizeObserverState.callback = null;
  vi.unstubAllGlobals();
});

it('fits images into the container and supports zoom controls, wheel zoom, clamp, and reset', () => {
  const value = renderHook({ enabled: true, resetKey: 'first' });
  const element = setContainerSize(800, 600);

  act(() => {
    value.image.handleImageLoad(createImageLoadEvent(1600, 900));
  });
  act(() => {
    triggerResize();
  });

  expect(latestValue?.image.style).toEqual({ height: '432px', width: '768px' });
  expect(latestValue?.controls.zoom).toBe(0.48);
  expect(latestValue?.controls.canZoomOut).toBe(false);

  act(() => {
    latestValue?.controls.zoomIn();
  });
  expect(latestValue?.image.style).toEqual({ height: '675px', width: '1200px' });

  const wheelEvent = dispatchWheel(element, {
    bubbles: true,
    cancelable: true,
    clientX: 600,
    clientY: 300,
    ctrlKey: true,
    deltaY: -100,
  });

  expect(wheelEvent.defaultPrevented).toBe(true);
  expect(latestValue?.controls.zoom).toBeGreaterThan(0.75);
  expect(latestValue?.controls.zoom).toBeLessThan(1);

  act(() => {
    for (let index = 0; index < 20; index += 1) {
      latestValue?.controls.zoomOut();
    }
  });
  expect(latestValue?.controls.zoom).toBe(0.48);

  act(() => {
    for (let index = 0; index < 40; index += 1) {
      latestValue?.controls.zoomIn();
    }
  });
  expect(latestValue?.controls.zoom).toBe(4);
  expect(latestValue?.controls.canZoomIn).toBe(false);

  act(() => {
    latestValue?.controls.resetZoom();
  });
  expect(latestValue?.controls.zoom).toBe(0.48);

  renderHook({ enabled: true, resetKey: 'second' });
  expect(latestValue?.controls.zoom).toBe(1);
  expect(latestValue?.image.style).toBeUndefined();
});

it('applies preloaded geometry before the next image becomes visible', () => {
  renderHook({ enabled: true, resetKey: 'first' });
  setContainerSize(800, 600);

  renderHook({
    enabled: true,
    naturalSize: { height: 900, width: 1600 },
    resetKey: 'second',
  });

  expect(latestValue?.image.ready).toBe(true);
  expect(latestValue?.image.style).toEqual({ height: '432px', width: '768px' });
  expect(latestValue?.controls.zoom).toBe(0.48);
});

it('lets a 1899 × 16843 full-page capture zoom beyond native size to 200%', () => {
  const value = renderHook({ enabled: true, resetKey: 'full-page' });
  setContainerSize(800, 600);

  act(() => {
    value.image.handleImageLoad(createImageLoadEvent(1899, 16843));
    triggerResize();
  });

  expect(latestValue?.controls.zoom).toBeCloseTo(520 / 16843);
  expect(latestValue?.image.style).toEqual({ height: '520px', width: '59px' });

  act(() => {
    for (let index = 0; index < 20; index += 1) latestValue?.controls.zoomIn();
  });

  expect(latestValue?.controls.zoom).toBe(2);
  expect(latestValue?.controls.canZoomIn).toBe(false);
  expect(latestValue?.controls.isZoomedFromFit).toBe(true);
  expect(latestValue?.image.style).toEqual({ height: '33686px', width: '3798px' });
});

it('limits very small images to a useful physical scale', () => {
  const value = renderHook({ enabled: true, resetKey: 'small' });
  setContainerSize(800, 600);

  act(() => {
    value.image.handleImageLoad(createImageLoadEvent(640, 480));
    triggerResize();
    for (let index = 0; index < 20; index += 1) latestValue?.controls.zoomIn();
  });

  expect(latestValue?.controls.zoom).toBe(2);
  expect(latestValue?.image.style).toEqual({ height: '960px', width: '1280px' });
});

it('keeps unmodified wheel input for scrolling and owns only modified wheel zoom', () => {
  const value = renderHook({ enabled: true, resetKey: 'wheel-contract' });
  const element = setContainerSize(800, 600);

  act(() => {
    value.image.handleImageLoad(createImageLoadEvent(1600, 900));
    triggerResize();
  });

  const initialZoom = latestValue?.controls.zoom;
  const scrollEvent = dispatchWheel(element, {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
  });
  expect(scrollEvent.defaultPrevented).toBe(false);
  expect(latestValue?.controls.zoom).toBe(initialZoom);

  const zoomEvent = dispatchWheel(element, {
    bubbles: true,
    cancelable: true,
    deltaY: -100,
    metaKey: true,
  });
  expect(zoomEvent.defaultPrevented).toBe(true);
  expect(latestValue?.controls.zoom).toBeGreaterThan(initialZoom ?? 0);
});

it('keeps the image point under the pointer stable during modified wheel zoom', () => {
  const value = renderHook({ enabled: true, resetKey: 'pointer-anchor' });
  const element = setContainerSize(800, 600);
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    get: () => Math.max(800, Number.parseFloat(latestValue?.image.style?.width ?? '0') + 32),
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => Math.max(600, Number.parseFloat(latestValue?.image.style?.height ?? '0') + 80),
  });

  act(() => {
    value.image.handleImageLoad(createImageLoadEvent(1600, 900));
    triggerResize();
  });

  dispatchWheel(element, {
    bubbles: true,
    cancelable: true,
    clientX: 600,
    clientY: 400,
    ctrlKey: true,
    deltaY: -100,
  });

  expect(element.scrollLeft).toBeGreaterThan(100);
  expect(element.scrollTop).toBeGreaterThan(0);
});

it('skips wheel zoom when disabled, falls back to element dimensions, and disconnects observer', () => {
  const value = renderHook({ enabled: false, resetKey: null });
  const element = setContainerSize(0, 0);

  act(() => {
    value.image.handleImageLoad(createImageLoadEvent(0, 200));
  });
  act(() => {
    triggerResize();
  });

  const wheelEvent = dispatchWheel(element, {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -100,
  });

  expect(wheelEvent.defaultPrevented).toBe(false);
  expect(latestValue?.controls.zoom).toBe(1);
  expect(latestValue?.image.style).toEqual({ height: '200px', width: '300px' });

  renderHook({ enabled: true, resetKey: 'enabled' });
  act(() => {
    root?.unmount();
  });

  expect(resizeObserverState.disconnect).toHaveBeenCalled();
  root = null;
});

it('pans a zoomed image with pointer drag while keeping the viewport fixed', () => {
  renderHook({ enabled: true, resetKey: 'drag' });
  const element = setContainerSize(800, 600);
  element.scrollLeft = 120;
  element.scrollTop = 80;
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => true);
  element.releasePointerCapture = vi.fn();

  act(() => {
    latestValue?.controls.zoomIn();
  });
  act(() => {
    latestValue?.viewport.handlePointerDown({
      button: 0,
      clientX: 100,
      clientY: 100,
      currentTarget: element,
      pointerId: 7,
    } as Parameters<NonNullable<typeof latestValue>['viewport']['handlePointerDown']>[0]);
  });
  expect(latestValue?.viewport.isPanning).toBe(true);

  act(() => {
    latestValue?.viewport.handlePointerMove({
      clientX: 70,
      clientY: 60,
      currentTarget: element,
    } as Parameters<NonNullable<typeof latestValue>['viewport']['handlePointerMove']>[0]);
  });
  expect(element.scrollLeft).toBe(150);
  expect(element.scrollTop).toBe(120);

  act(() => {
    latestValue?.viewport.handlePointerEnd({
      currentTarget: element,
      pointerId: 7,
    } as Parameters<NonNullable<typeof latestValue>['viewport']['handlePointerEnd']>[0]);
  });
  expect(latestValue?.viewport.isPanning).toBe(false);
  expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
});
