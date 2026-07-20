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
  latestValue = useGalleryViewportState();
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
