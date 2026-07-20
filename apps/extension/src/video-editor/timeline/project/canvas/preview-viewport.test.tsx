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
}) {
  const timelineRef = React.useRef<HTMLDivElement | null>(null);

  useTimelinePreviewViewportReporter({
    onViewportChange: props.onViewportChange,
    pixelsPerSecond: props.pixelsPerSecond,
    timelineRef,
    timelineWidth: 400,
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

  expect(reportedViewports).toEqual([{ endTime: 4, startTime: 0 }]);
});

it('publishes when the resolved preview viewport changes', () => {
  const reportedViewports: TimelinePreviewViewport[] = [];

  renderHarness(1, reportedViewports);
  renderHarness(2, reportedViewports, 200);

  expect(reportedViewports).toEqual([
    { endTime: 4, startTime: 0 },
    { endTime: 2, startTime: 0 },
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
