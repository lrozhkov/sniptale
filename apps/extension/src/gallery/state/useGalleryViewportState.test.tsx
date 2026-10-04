// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGalleryViewportState } from './useGalleryViewportState';

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useGalleryViewportState> | null = null;
let resizeObserver: ResizeObserverMock | null = null;
let attachedViewport: HTMLDivElement | null = null;

function HookProbe(props: {
  measurements?: { clientHeight: number; clientWidth: number; scrollTop: number };
}) {
  latestValue = useGalleryViewportState(Boolean(props.measurements));
  const measurements = props.measurements;

  return measurements ? (
    <div
      ref={(node) => {
        attachedViewport = node;
        if (!node || !latestValue) {
          return;
        }

        Object.defineProperties(node, {
          clientHeight: { configurable: true, value: measurements.clientHeight },
          clientWidth: { configurable: true, value: measurements.clientWidth },
          scrollTop: {
            configurable: true,
            value: measurements.scrollTop,
            writable: true,
          },
        });
        latestValue.gridViewportRef.current = node;
      }}
    />
  ) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const registerResizeObserver = (callback: ResizeObserverCallback): ResizeObserverMock => {
    const observer = new ResizeObserverMock(callback);
    resizeObserver = observer;
    return observer;
  };
  vi.stubGlobal(
    'ResizeObserver',
    class extends ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        return registerResizeObserver(callback);
      }
    }
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  attachedViewport = null;
  latestValue = null;
  resizeObserver = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  attachedViewport = null;
  resizeObserver = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('exposes stable refs before a viewport element is attached', () => {
  act(() => {
    root?.render(<HookProbe />);
  });

  expect(latestValue?.gridWidth).toBe(1200);
  expect(latestValue?.viewportHeight).toBe(720);
  expect(latestValue?.scrollTop).toBe(0);
  expect(latestValue?.gridViewportRef.current).toBeNull();
  expect(latestValue?.importInputRef.current).toBeNull();
  expect(resizeObserver).toBeNull();
});

it('reads viewport measurements, subscribes to scroll and resize, and cleans up on unmount', () => {
  act(() => {
    root?.render(
      <HookProbe measurements={{ clientHeight: 640, clientWidth: 920, scrollTop: 120 }} />
    );
  });

  if (!latestValue || !attachedViewport) {
    throw new Error('Expected viewport state and attached viewport');
  }
  const viewport = attachedViewport;

  expect(latestValue.gridWidth).toBe(920);
  expect(latestValue.viewportHeight).toBe(640);
  expect(latestValue.scrollTop).toBe(120);
  expect(resizeObserver?.observe).toHaveBeenCalledWith(viewport);

  Object.defineProperty(viewport, 'scrollTop', {
    configurable: true,
    value: 260,
    writable: true,
  });
  act(() => {
    viewport.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
  });
  expect(latestValue.scrollTop).toBe(260);

  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 700 });
  act(() => {
    resizeObserver?.callback([], resizeObserver as unknown as ResizeObserver);
  });
  expect(latestValue.gridWidth).toBe(1000);
  expect(latestValue.viewportHeight).toBe(700);

  act(() => {
    root?.unmount();
  });

  expect(resizeObserver?.disconnect).toHaveBeenCalledTimes(1);
  root = null;
});

it('measures and observes a viewport mounted after the loading screen', () => {
  act(() => root?.render(<HookProbe />));
  act(() =>
    root?.render(
      <HookProbe measurements={{ clientHeight: 980, clientWidth: 2100, scrollTop: 0 }} />
    )
  );
  expect(latestValue?.gridWidth).toBe(2100);
  expect(latestValue?.viewportHeight).toBe(980);
  expect(resizeObserver?.observe).toHaveBeenCalledWith(attachedViewport);
  act(() => {
    if (attachedViewport) {
      attachedViewport.scrollTop = 1800;
      attachedViewport.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(16);
    }
  });
  expect(latestValue?.scrollTop).toBe(1800);
});

it('coalesces scroll positions per frame without reading layout and cancels pending work', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  const cancel = vi.fn((id: number) => frames.delete(id));
  vi.stubGlobal('cancelAnimationFrame', cancel);
  act(() =>
    root?.render(<HookProbe measurements={{ clientHeight: 640, clientWidth: 920, scrollTop: 0 }} />)
  );
  const style = vi.spyOn(window, 'getComputedStyle');
  const viewport = attachedViewport!;
  const width = vi.fn(() => 920);
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: width });
  act(() => {
    viewport.scrollTop = 100;
    viewport.dispatchEvent(new Event('scroll'));
    viewport.scrollTop = 250;
    viewport.dispatchEvent(new Event('scroll'));
  });
  expect(style).not.toHaveBeenCalled();
  expect(width).not.toHaveBeenCalled();
  expect(frames.size).toBe(1);
  act(() => {
    for (const callback of frames.values()) callback(0);
    frames.clear();
  });
  expect(latestValue?.scrollTop).toBe(250);
  act(() => viewport.dispatchEvent(new Event('scroll')));
  act(() => root?.unmount());
  root = null;
  expect(cancel).toHaveBeenCalled();
  expect(frames.size).toBe(0);
  style.mockRestore();
});
