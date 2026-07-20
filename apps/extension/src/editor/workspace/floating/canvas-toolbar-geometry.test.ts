// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  attachCanvasToolbarVisibilityRuntime: vi.fn(() => () => undefined),
  controller: null as unknown,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal()),
  useEditorController: () => runtimeMocks.controller,
}));

vi.mock('./canvas-toolbar-visibility-runtime', () => ({
  attachCanvasToolbarVisibilityRuntime: runtimeMocks.attachCanvasToolbarVisibilityRuntime,
}));

import {
  type CanvasToolbarGeometryController,
  resolveObjectViewportRect,
  useCanvasSelectionToolbarGeometry,
} from './canvas-toolbar-geometry';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createControllerMock(options: {
  canvasRect?: Partial<DOMRect>;
  canvasSize?: { height: number; width: number };
  objectCoords: Array<{ x: number; y: number }>;
  viewportTransform?: [number, number, number, number, number, number];
  zoom?: number;
}) {
  const object = { getCoords: vi.fn(() => options.objectCoords) };
  const canvas = {
    getActiveObject: vi.fn(() => object),
    getElement: vi.fn(() => ({
      height: options.canvasSize?.height ?? 0,
      getBoundingClientRect: () => ({
        bottom: 0,
        height: options.canvasRect?.height ?? 0,
        left: options.canvasRect?.left ?? 100,
        right: 0,
        top: options.canvasRect?.top ?? 50,
        width: options.canvasRect?.width ?? 0,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
      width: options.canvasSize?.width ?? 0,
    })),
    getZoom: vi.fn(() => options.zoom ?? 1),
    viewportTransform: options.viewportTransform,
  };

  return { canvas } satisfies CanvasToolbarGeometryController;
}

function createVisibleControllerMock() {
  return createControllerMock({
    objectCoords: [
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 40 },
      { x: 10, y: 40 },
    ],
    viewportTransform: [2, 0, 0, 2, 30, 40],
    zoom: 2,
  });
}

function renderGeometryHook(enabled: boolean, controller = createVisibleControllerMock()) {
  let value: ReturnType<typeof useCanvasSelectionToolbarGeometry> | null = null;

  runtimeMocks.controller = controller;
  const Harness = () => {
    value = useCanvasSelectionToolbarGeometry(enabled);
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(Harness)));

  return {
    controller,
    getValue: () => value,
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  runtimeMocks.attachCanvasToolbarVisibilityRuntime.mockClear();
  runtimeMocks.controller = null;
});

it('positions the selection toolbar from the full Fabric viewport transform', () => {
  const rect = resolveObjectViewportRect(createVisibleControllerMock());

  expect(rect).toEqual({
    bottom: 170,
    height: 40,
    left: 150,
    right: 250,
    top: 130,
    width: 100,
  });
});

it('initializes the hook from the editor controller context', () => {
  const { controller, getValue } = renderGeometryHook(true);

  expect(getValue()).toEqual({
    geometry: { left: 232, placement: 'below-selection', top: 234 },
    visibilityRevision: 0,
  });
  expect(runtimeMocks.attachCanvasToolbarVisibilityRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ controller })
  );
});

it('accounts for CSS-scaled canvas zoom when Fabric viewport transform stays identity', () => {
  const rect = resolveObjectViewportRect(
    createControllerMock({
      canvasRect: { height: 300, left: -120, top: 80, width: 600 },
      canvasSize: { height: 200, width: 400 },
      objectCoords: [
        { x: 100, y: 50 },
        { x: 200, y: 50 },
        { x: 200, y: 100 },
        { x: 100, y: 100 },
      ],
      viewportTransform: [1, 0, 0, 1, 0, 0],
      zoom: 1,
    })
  );

  expect(rect).toEqual({
    bottom: 230,
    height: 75,
    left: 30,
    right: 180,
    top: 155,
    width: 150,
  });
});

it('falls back to zoom-only mapping for canvases without viewport transform', () => {
  const rect = resolveObjectViewportRect(
    createControllerMock({
      objectCoords: [
        { x: 10, y: 20 },
        { x: 60, y: 20 },
        { x: 60, y: 40 },
        { x: 10, y: 40 },
      ],
      zoom: 1.5,
    })
  );

  expect(rect).toEqual({
    bottom: 110,
    height: 30,
    left: 115,
    right: 190,
    top: 80,
    width: 75,
  });
});
