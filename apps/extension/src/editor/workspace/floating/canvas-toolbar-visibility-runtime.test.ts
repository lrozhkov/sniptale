// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { attachCanvasToolbarVisibilityRuntime } from './canvas-toolbar-visibility-runtime';
import type { ToolbarGeometryState } from './canvas-toolbar-geometry-types';

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Set<Listener>>();

afterEach(() => {
  listeners.clear();
  vi.useRealTimers();
});

function createHarness() {
  let state: ToolbarGeometryState = {
    geometry: { left: 10, placement: 'above-selection', top: 20 },
    visibilityRevision: 0,
  };
  const viewportElement = document.createElement('div');
  const setState = vi.fn(
    (update: ToolbarGeometryState | ((current: ToolbarGeometryState) => ToolbarGeometryState)) => {
      state = typeof update === 'function' ? update(state) : update;
    }
  );
  const controller = {
    canvas: {
      off: vi.fn((event: string, handler: Listener) => listeners.get(event)?.delete(handler)),
      on: vi.fn((event: string, handler: Listener) => {
        const bucket = listeners.get(event) ?? new Set<Listener>();
        bucket.add(handler);
        listeners.set(event, bucket);
      }),
    },
    viewportElement,
  };
  const detach = attachCanvasToolbarVisibilityRuntime({
    controller: controller as never,
    resolveState: (visibilityRevision) => ({
      geometry: { left: 30, placement: 'below-selection', top: 40 },
      visibilityRevision,
    }),
    setState: setState as never,
  });

  return {
    detach,
    getState: () => state,
    viewportElement,
  };
}

it('restores transform-hidden toolbar only after primary mouse release and delay', () => {
  vi.useFakeTimers();
  const harness = createHarness();

  listeners.get('object:moving')?.forEach((handler) => handler());
  expect(harness.getState()).toEqual({ geometry: null, visibilityRevision: 1 });

  listeners.get('object:modified')?.forEach((handler) => handler());
  vi.advanceTimersByTime(500);
  expect(harness.getState()).toEqual({ geometry: null, visibilityRevision: 1 });

  listeners.get('mouse:up')?.forEach((handler) => handler());
  vi.advanceTimersByTime(499);
  expect(harness.getState()).toEqual({ geometry: null, visibilityRevision: 1 });

  vi.advanceTimersByTime(1);
  expect(harness.getState()).toEqual({
    geometry: { left: 30, placement: 'below-selection', top: 40 },
    visibilityRevision: 1,
  });
  harness.detach();
});

it('restores viewport-hidden toolbar after delay without waiting for mouse release', () => {
  vi.useFakeTimers();
  const harness = createHarness();

  harness.viewportElement.dispatchEvent(new Event('scroll'));
  expect(harness.getState()).toEqual({ geometry: null, visibilityRevision: 1 });

  window.dispatchEvent(new MouseEvent('mousedown', { button: 1 }));
  vi.advanceTimersByTime(500);
  expect(harness.getState()).toEqual({
    geometry: { left: 30, placement: 'below-selection', top: 40 },
    visibilityRevision: 1,
  });
  harness.detach();
});
