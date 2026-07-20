import { expect, it } from 'vitest';
import { getPreviewSize, getViewportCenter, getViewportFrame } from './helpers';
import type { EditorViewportMetrics } from './types';

function viewport(overrides: Partial<EditorViewportMetrics> = {}): EditorViewportMetrics {
  return {
    canvasHeight: 400,
    canvasOffsetLeft: 20,
    canvasOffsetTop: 30,
    canvasWidth: 800,
    scaledCanvasHeight: 400,
    scaledCanvasWidth: 800,
    scrollLeft: 120,
    scrollTop: 130,
    viewportHeight: 200,
    viewportWidth: 300,
    ...overrides,
  };
}

it('calculates preview size for empty, wide, and tall canvases', () => {
  expect(getPreviewSize(0, 0, 80)).toEqual({ height: 80, width: 112 });
  expect(getPreviewSize(1600, 800, 196)).toEqual({ height: 98, width: 196 });
  expect(getPreviewSize(400, 1200, 196)).toEqual({ height: 138, width: 112 });
});

it('calculates viewport center and clamps invalid canvas metrics', () => {
  expect(getViewportCenter(viewport())).toEqual({ x: 0.3125, y: 0.5 });
  expect(getViewportCenter(viewport({ scaledCanvasHeight: 0, scaledCanvasWidth: 0 }))).toEqual({
    x: 0.5,
    y: 0.5,
  });
});

it('calculates a clamped viewport frame inside the preview', () => {
  expect(
    getViewportFrame({
      previewSize: { height: 100, width: 200 },
      viewport: viewport({
        scaledCanvasHeight: 400,
        scaledCanvasWidth: 800,
        scrollLeft: 780,
        scrollTop: 390,
      }),
    })
  ).toEqual({ height: 18, left: 182, top: 82, width: 18 });
  expect(
    getViewportFrame({
      previewSize: { height: 100, width: 200 },
      viewport: viewport({ scaledCanvasHeight: 0 }),
    })
  ).toBeNull();
});
