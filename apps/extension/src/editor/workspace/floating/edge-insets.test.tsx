// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  getFloatingWorkspaceEdgeInsetStyle,
  measureFloatingWorkspaceEdgeInsets,
  useFloatingWorkspaceEdgeInsets,
} from './edge-insets';

function createMeasuredElement(metrics: {
  clientHeight: number;
  clientLeft?: number;
  clientTop?: number;
  clientWidth: number;
  offsetHeight: number;
  offsetWidth: number;
}) {
  const element = document.createElement('div');

  for (const [key, value] of Object.entries({
    clientHeight: metrics.clientHeight,
    clientLeft: metrics.clientLeft ?? 0,
    clientTop: metrics.clientTop ?? 0,
    clientWidth: metrics.clientWidth,
    offsetHeight: metrics.offsetHeight,
    offsetWidth: metrics.offsetWidth,
  })) {
    Object.defineProperty(element, key, { configurable: true, value });
  }

  return element;
}

it('measures the visual right and bottom inset reserved by canvas scrollbars', () => {
  const element = createMeasuredElement({
    clientHeight: 783,
    clientWidth: 983,
    offsetHeight: 800,
    offsetWidth: 1000,
  });

  expect(measureFloatingWorkspaceEdgeInsets(element)).toEqual({ bottom: 17, right: 17 });
});

it('subtracts leading stable scrollbar gutters from the right inset', () => {
  const element = createMeasuredElement({
    clientHeight: 783,
    clientLeft: 15,
    clientWidth: 970,
    offsetHeight: 800,
    offsetWidth: 1000,
  });

  expect(measureFloatingWorkspaceEdgeInsets(element)).toEqual({ bottom: 17, right: 15 });
});

it('exposes measured insets as floating workspace CSS variables', () => {
  expect(getFloatingWorkspaceEdgeInsetStyle({ bottom: 14, right: 16 })).toEqual({
    '--editor-floating-edge-bottom': '14px',
    '--editor-floating-edge-right': '16px',
  });
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function InsetsProbe(props: { hasImage: boolean; onValue: (value: unknown) => void }) {
  props.onValue(useFloatingWorkspaceEdgeInsets(props.hasImage));
  return null;
}

function renderProbe(hasImage: boolean, onValue = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<InsetsProbe hasImage={hasImage} onValue={onValue} />);
  });

  return onValue;
}

it('keeps zero insets when no image is loaded or the viewport is absent', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const onValue = renderProbe(false);

  expect(onValue).toHaveBeenLastCalledWith({ bottom: 0, right: 0 });

  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;

  const missingViewport = renderProbe(true);
  expect(missingViewport).toHaveBeenLastCalledWith({ bottom: 0, right: 0 });
});

it('updates measured insets through ResizeObserver and cleans up observers', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const viewport = createMeasuredElement({
    clientHeight: 90,
    clientWidth: 80,
    offsetHeight: 100,
    offsetWidth: 100,
  });
  viewport.dataset['ui'] = 'editor.canvas.viewport';
  const child = document.createElement('div');
  viewport.appendChild(child);
  document.body.appendChild(viewport);

  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function ResizeObserverMock(this: unknown) {
      Object.assign(this as object, { disconnect, observe });
    })
  );

  const onValue = renderProbe(true);

  expect(onValue).toHaveBeenLastCalledWith({ bottom: 10, right: 20 });
  expect(observe).toHaveBeenCalledWith(viewport);
  expect(observe).toHaveBeenCalledWith(child);

  act(() => root?.unmount());
  expect(disconnect).toHaveBeenCalled();
  viewport.remove();
});
