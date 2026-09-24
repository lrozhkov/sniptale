// @vitest-environment jsdom

import { Canvas, Rect } from 'fabric';
import { expect, it } from 'vitest';
import {
  EDITOR_WORKSPACE_MARGIN,
  getEditorDocumentClientRect,
  setEditorEditingSurfaceDimensions,
} from './editing-surface';

it('keeps off-image objects inside Fabric hit space while image coordinates stay unchanged', () => {
  const element = document.createElement('canvas');
  const canvas = new Canvas(element);
  setEditorEditingSurfaceDimensions(canvas, { width: 100, height: 80 });
  const arrow = new Rect({ left: -150, top: 25, width: 60, height: 20 });
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
    ({ left: 0, top: 0, width: 1124, height: 1104 }) as DOMRect;
  expect(
    canvas.findTarget(new MouseEvent('mousemove', { clientX: 390, clientY: 545 })).target
  ).toBe(arrow);

  element.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 1124, height: 1104 }) as DOMRect;
  expect(getEditorDocumentClientRect(element, { width: 100, height: 80 }, canvas)).toEqual({
    left: 10 + EDITOR_WORKSPACE_MARGIN,
    top: 20 + EDITOR_WORKSPACE_MARGIN,
    width: 100,
    height: 80,
  });
});
