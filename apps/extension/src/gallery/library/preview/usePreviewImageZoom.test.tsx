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

function HookProbe(props: { enabled: boolean; resetKey: string | null }) {
  latestValue = usePreviewImageZoom(props.enabled, props.resetKey);
  return <div ref={latestValue.containerRef} data-ui="preview.zoom.container" />;
}

function renderHook(props: { enabled: boolean; resetKey: string | null }) {
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

function dispatchWheelZoom() {
  const wheelEvent = new WheelEvent('wheel', { deltaY: -10 });
  const preventDefault = vi.spyOn(wheelEvent, 'preventDefault');

  act(() => {
    latestValue?.handleWheel(wheelEvent);
  });

  return preventDefault;
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
  setContainerSize(800, 600);

  act(() => {
    value.handleImageLoad(createImageLoadEvent(1600, 900));
  });
  act(() => {
    triggerResize();
  });

  expect(latestValue?.imageStyle).toEqual({ height: '450px', width: '800px' });
  expect(latestValue?.zoom).toBe(1);

  act(() => {
    latestValue?.zoomIn();
  });
  expect(latestValue?.imageStyle).toEqual({ height: '563px', width: '1000px' });

  const preventDefault = dispatchWheelZoom();

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(latestValue?.zoom).toBe(1.5);

  act(() => {
    for (let index = 0; index < 20; index += 1) {
      latestValue?.zoomOut();
    }
  });
  expect(latestValue?.zoom).toBe(0.5);

  act(() => {
    for (let index = 0; index < 40; index += 1) {
      latestValue?.zoomIn();
    }
  });
  expect(latestValue?.zoom).toBe(4);

  act(() => {
    latestValue?.resetZoom();
  });
  expect(latestValue?.zoom).toBe(1);

  renderHook({ enabled: true, resetKey: 'second' });
  expect(latestValue?.zoom).toBe(1);
  expect(latestValue?.imageStyle).toBeUndefined();
});

it('skips wheel zoom when disabled, falls back to element dimensions, and disconnects observer', () => {
  const value = renderHook({ enabled: false, resetKey: null });
  setContainerSize(0, 0);

  act(() => {
    value.handleImageLoad(createImageLoadEvent(0, 200));
  });
  act(() => {
    triggerResize();
  });

  const preventDefault = dispatchWheelZoom();

  expect(preventDefault).not.toHaveBeenCalled();
  expect(latestValue?.zoom).toBe(1);
  expect(latestValue?.imageStyle).toEqual({ height: '200px', width: '300px' });

  renderHook({ enabled: true, resetKey: 'enabled' });
  act(() => {
    root?.unmount();
  });

  expect(resizeObserverState.disconnect).toHaveBeenCalled();
  root = null;
});
