// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorViewportPreview } from './hook';
import type { EditorViewportMetrics } from './types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  stopLoop: vi.fn(),
  startLoop: vi.fn((_args: unknown) => vi.fn()),
}));

vi.mock('./drawing', () => ({
  startEditorViewportPreviewLoop: (args: unknown) => {
    mocks.startLoop(args);
    return mocks.stopLoop;
  },
}));

vi.mock('./navigation', () => ({
  navigateEditorViewportFromClientPoint: (...args: unknown[]) => mocks.navigate(...args),
}));

const viewport: EditorViewportMetrics = {
  canvasHeight: 400,
  canvasOffsetLeft: 0,
  canvasOffsetTop: 0,
  canvasWidth: 800,
  scaledCanvasHeight: 400,
  scaledCanvasWidth: 800,
  scrollLeft: 0,
  scrollTop: 0,
  viewportHeight: 200,
  viewportWidth: 200,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let lastHook: ReturnType<typeof useEditorViewportPreview> | null = null;

function Probe(props: { hasImage: boolean; open: boolean }) {
  lastHook = useEditorViewportPreview({
    canvasRef: { current: document.createElement('canvas') },
    controller: { navigateViewportTo: vi.fn() } as never,
    hasImage: props.hasImage,
    maxWidth: 140,
    viewport,
    viewportPreviewOpen: props.open,
  });
  return null;
}

function renderProbe(props: { hasImage: boolean; open: boolean }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Probe {...props} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  lastHook = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('derives preview geometry and starts drawing only while open with an image', () => {
  renderProbe({ hasImage: false, open: true });

  expect(lastHook?.previewSize).toEqual({ height: 80, width: 140 });
  expect(lastHook?.viewportCenter).toEqual({ x: 0.125, y: 0.25 });
  expect(lastHook?.viewportFrame).toEqual({ height: 40, left: 0, top: 0, width: 35 });
  expect(mocks.startLoop).not.toHaveBeenCalled();

  act(() => root?.render(<Probe hasImage open />));
  expect(mocks.startLoop).toHaveBeenCalledOnce();
});

it('routes preview client points through navigation helper and cleans up drawing', () => {
  renderProbe({ hasImage: true, open: true });

  lastHook?.navigateFromClientPoint(10, 20);

  expect(mocks.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ clientX: 10, clientY: 20 })
  );

  act(() => root?.unmount());
  expect(mocks.stopLoop).toHaveBeenCalledOnce();
});
