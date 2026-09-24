// @vitest-environment jsdom

import { Canvas, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  EDITOR_WORKSPACE_MARGIN,
  getEditorDocumentClientRect,
  getEditorEditingSurfaceSize,
  getEditorWorkspaceMargin,
  setEditorEditingSurfaceDimensions,
} from './editing-surface';

it('keeps off-image objects inside Fabric hit space while image coordinates stay unchanged', () => {
  const element = document.createElement('canvas');
  const canvas = new Canvas(element);
  setEditorEditingSurfaceDimensions(canvas, { width: 100, height: 80 });
  const arrow = new Rect({ left: -1200, top: 25, width: 60, height: 20 });
  canvas.add(arrow);
  arrow.setCoords();

  expect(canvas.getWidth()).toBe(100 + EDITOR_WORKSPACE_MARGIN * 2);
  expect(canvas.getHeight()).toBe(80 + EDITOR_WORKSPACE_MARGIN * 2);
  expect(canvas.viewportTransform).toEqual([
    1,
    0,
    0,
    1,
    EDITOR_WORKSPACE_MARGIN,
    EDITOR_WORKSPACE_MARGIN,
  ]);
  const bounds = arrow.getBoundingRect();
  expect(bounds.left + bounds.width).toBeLessThan(0);
  expect(arrow.calcOCoords()['tl']!.x).toBeGreaterThan(0);

  canvas.upperCanvasEl.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 100 + EDITOR_WORKSPACE_MARGIN * 2,
      height: 80 + EDITOR_WORKSPACE_MARGIN * 2,
    }) as DOMRect;
  expect(
    canvas.findTarget(
      new MouseEvent('mousemove', {
        clientX: EDITOR_WORKSPACE_MARGIN - 1170,
        clientY: EDITOR_WORKSPACE_MARGIN + 35,
      })
    ).target
  ).toBe(arrow);

  element.getBoundingClientRect = () =>
    ({
      left: 10,
      top: 20,
      width: 100 + EDITOR_WORKSPACE_MARGIN * 2,
      height: 80 + EDITOR_WORKSPACE_MARGIN * 2,
    }) as DOMRect;
  expect(getEditorDocumentClientRect(element, { width: 100, height: 80 }, canvas)).toEqual({
    left: 10 + EDITOR_WORKSPACE_MARGIN,
    top: 20 + EDITOR_WORKSPACE_MARGIN,
    width: 100,
    height: 80,
  });
});

it('bounds the backing canvas area for a large image', () => {
  const size = { width: 4000, height: 3000 };
  const margin = getEditorWorkspaceMargin(size);
  const surface = getEditorEditingSurfaceSize(size);

  expect(margin).toBeGreaterThanOrEqual(512);
  expect(margin).toBeLessThan(EDITOR_WORKSPACE_MARGIN);
  expect(surface.width * surface.height).toBeLessThanOrEqual(32_000_000);
});

it('avoids a device-pixel-ratio multiplication of the extended hit surface', () => {
  vi.stubGlobal('devicePixelRatio', 2);
  try {
    const canvas = new Canvas(document.createElement('canvas'));
    const size = { width: 100, height: 80 };
    setEditorEditingSurfaceDimensions(canvas, size);

    expect(canvas.enableRetinaScaling).toBe(false);
    expect(canvas.upperCanvasEl.width).toBe(getEditorEditingSurfaceSize(size).width);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('restores unextended geometry when the image is closed', () => {
  const element = document.createElement('canvas');
  const canvas = new Canvas(element);
  setEditorEditingSurfaceDimensions(canvas, { width: 100, height: 80 });
  setEditorEditingSurfaceDimensions(canvas, { width: 0, height: 0 });

  expect(getEditorEditingSurfaceSize({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  expect(canvas.getWidth()).toBe(0);
  expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
  element.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 80 }) as DOMRect;
  expect(getEditorDocumentClientRect(element, { width: 100, height: 80 }, canvas)).toEqual({
    left: 10,
    top: 20,
    width: 100,
    height: 80,
  });
});
