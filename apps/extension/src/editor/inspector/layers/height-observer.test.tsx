// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAnimationFrameScheduler, useLayerPanelResizeObserver } from './height-observer';

const observerState = {
  callback: null as ResizeObserverCallback | null,
  disconnect: vi.fn(),
  observe: vi.fn(),
};

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    observerState.callback = callback;
  }
  disconnect = observerState.disconnect;
  observe = observerState.observe;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness(props: {
  expanded: boolean;
  frozen: boolean;
  onSchedule: (value: string) => void;
}) {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const frozenAfterDeleteRef = React.useRef(props.frozen);
  frozenAfterDeleteRef.current = props.frozen;
  const scheduler = useAnimationFrameScheduler(props.onSchedule as never);
  useLayerPanelResizeObserver({
    expanded: props.expanded,
    frameRef,
    frozenAfterDeleteRef,
    cancel: scheduler.cancel,
    schedule: scheduler.schedule,
  });

  return (
    <div>
      <div ref={frameRef} />
    </div>
  );
}

function renderHarness(props: {
  expanded: boolean;
  frozen: boolean;
  onSchedule: (value: string) => void;
}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness {...props} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  vi.clearAllMocks();
  observerState.callback = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('observes parent resize and schedules measure or clamp behavior', () => {
  const onSchedule = vi.fn();
  renderHarness({ expanded: true, frozen: false, onSchedule });

  observerState.callback?.([], {} as ResizeObserver);
  expect(observerState.observe).toHaveBeenCalled();
  expect(onSchedule).toHaveBeenCalledWith('measure');

  act(() => root?.render(<Harness expanded frozen onSchedule={onSchedule} />));
  observerState.callback?.([], {} as ResizeObserver);
  expect(onSchedule).toHaveBeenCalledWith('clamp');

  act(() => root?.unmount());
  expect(observerState.disconnect).toHaveBeenCalled();
  expect(window.cancelAnimationFrame).toHaveBeenCalled();
});
