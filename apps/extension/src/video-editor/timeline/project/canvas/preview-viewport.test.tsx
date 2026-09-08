// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TimelinePreviewViewport } from '../../../contracts/timeline-preview';
import { useTimelinePreviewViewportReporter } from './preview-viewport';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalDivClientWidthDescriptor: PropertyDescriptor | undefined;

function TimelineViewportHarness(props: {
  onViewportChange: (viewport: TimelinePreviewViewport) => void;
  pixelsPerSecond: number;
  renderToken: number;
  startTime?: number | undefined;
}) {
  const timelineRef = React.useRef<HTMLDivElement | null>(null);

  useTimelinePreviewViewportReporter({
    onViewportChange: props.onViewportChange,
    pixelsPerSecond: props.pixelsPerSecond,
    timelineRef,
    timelineWidth: 400,
    startTime: props.startTime,
  });

  return (
    <div ref={timelineRef} data-token={props.renderToken}>
      timeline
    </div>
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  installTimelineDimensions();
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  restoreDescriptor(HTMLDivElement.prototype, 'clientWidth', originalDivClientWidthDescriptor);
  vi.unstubAllGlobals();
});

it('does not republish identical preview viewports across idle rerenders', () => {
  const reportedViewports: TimelinePreviewViewport[] = [];

  renderHarness(1, reportedViewports);
  renderHarness(2, reportedViewports);
  renderHarness(3, reportedViewports);

  expect(reportedViewports).toEqual([{ endTime: 4, startTime: 0, pixelsPerSecond: 100 }]);
});

it('publishes when the resolved preview viewport changes', () => {
  const reportedViewports: TimelinePreviewViewport[] = [];

  renderHarness(1, reportedViewports);
  renderHarness(2, reportedViewports, 200);

  expect(reportedViewports).toEqual([
    { endTime: 4, startTime: 0, pixelsPerSecond: 100 },
    { endTime: 2, startTime: 0, pixelsPerSecond: 200 },
  ]);
});

function renderHarness(
  renderToken: number,
  reportedViewports: TimelinePreviewViewport[],
  pixelsPerSecond = 100
) {
  const onViewportChange = (viewport: TimelinePreviewViewport) => {
    reportedViewports.push(viewport);
  };

  act(() => {
    root?.render(
      <TimelineViewportHarness
        onViewportChange={onViewportChange}
        pixelsPerSecond={pixelsPerSecond}
        renderToken={renderToken}
      />
    );
  });
}

function installTimelineDimensions() {
  originalDivClientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDivElement.prototype,
    'clientWidth'
  );
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 400,
  });
}

function restoreDescriptor(target: object, key: string, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

it('republishes resized viewports and releases the resize observer on unmount', () => {
  let notifyResize: (() => void) | undefined;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  const viewports: TimelinePreviewViewport[] = [];
  renderHarness(1, viewports);
  expect(observe).toHaveBeenCalledOnce();
  Object.defineProperty(container!.firstElementChild, 'clientWidth', { value: 800 });
  act(() => notifyResize?.());
  expect(viewports.at(-1)).toEqual({ startTime: 0, endTime: 8, pixelsPerSecond: 100 });
  act(() => root?.unmount());
  root = null;
  expect(disconnect).toHaveBeenCalledOnce();
});

it('reports the actual time span at fractional overview scale', () => {
  const viewports: TimelinePreviewViewport[] = [];
  renderHarness(1, viewports, 0.01);
  expect(viewports).toEqual([{ startTime: 0, endTime: 40000, pixelsPerSecond: 0.01 }]);
});

it('publishes precise start changes even when the native scroll position is unchanged', () => {
  const onViewportChange = vi.fn();
  const startTime = 43200 + 1 / 240;
  act(() =>
    root?.render(
      <TimelineViewportHarness
        onViewportChange={onViewportChange}
        pixelsPerSecond={280}
        renderToken={1}
        startTime={startTime}
      />
    )
  );
  expect(onViewportChange.mock.lastCall?.[0].startTime).toBe(startTime);
  act(() =>
    root?.render(
      <TimelineViewportHarness
        onViewportChange={onViewportChange}
        pixelsPerSecond={280}
        renderToken={2}
        startTime={startTime + 1 / 240}
      />
    )
  );
  expect(onViewportChange).toHaveBeenCalledTimes(2);
  const viewport = onViewportChange.mock.lastCall?.[0];
  expect(viewport.startTime).toBe(startTime + 1 / 240);
  expect(viewport.endTime - viewport.startTime).toBeCloseTo(400 / 280, 10);
});
