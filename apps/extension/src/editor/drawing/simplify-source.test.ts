// @vitest-environment jsdom
import { Canvas, Rect } from 'fabric';
import { Image as CanvasImage } from 'canvas';
import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import { createEditorDrawingSimplifyObject, sampleEditorSimplifyRegion } from './object/simplify';
import { captureSource } from './simplify-source';
import * as editingSurface from '../document/canvas-surface/editing-surface';

const canvases: Canvas[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(canvases.splice(0).map((canvas) => canvas.dispose()));
});
function fixture(bounds = { x: 100, y: 9000, width: 200, height: 80 }) {
  const canvas = new Canvas(document.createElement('canvas'), { width: 400, height: 300 });
  canvases.push(canvas);
  const drawing = {
    id: 'area',
    kind: 'simplify' as const,
    bounds,
    settings: createDefaultSimplifySettings(),
  };
  const lower = new Rect({
    ...bounds,
    left: bounds.x,
    top: bounds.y,
    originX: 'left',
    originY: 'top',
    fill: '#ff0000',
    strokeWidth: 0,
    objectCaching: false,
  });
  const object = createEditorDrawingSimplifyObject(drawing, 1);
  const upper = new Rect({
    ...bounds,
    left: bounds.x,
    top: bounds.y,
    originX: 'left',
    originY: 'top',
    fill: '#00ff00',
    strokeWidth: 0,
    objectCaching: false,
  });
  canvas.add(lower, object, upper);
  vi.spyOn(editingSurface, 'getEditorEditingDocumentSize').mockReturnValue({
    width: 2545,
    height: 29136,
  });
  return { canvas, drawing, object };
}
it('captures native pixels under a small region on an oversized document without upper layers', () => {
  const { canvas, drawing, object } = fixture();
  const viewport = [...canvas.viewportTransform];
  const dimensions = { width: canvas.width, height: canvas.height };
  const source = captureSource(canvas, object);
  expect(source.width * source.height).toBeLessThanOrEqual(16_777_216);
  expect(source.width).toBe(source.bounds.width);
  expect(source.height).toBe(source.bounds.height);
  expect(source.bounds.y).toBeGreaterThan(0);
  const region = sampleEditorSimplifyRegion(drawing, source).region;
  expect(region).toMatchObject({ width: 200, height: 80 });
  vi.stubGlobal('Image', CanvasImage);
  const decoded = new Image();
  decoded.src = source.dataUrl;
  const pixels = document.createElement('canvas');
  pixels.width = source.width;
  pixels.height = source.height;
  const context = pixels.getContext('2d')!;
  context.drawImage(decoded, 0, 0);
  expect([...context.getImageData(region.x + 10, region.y + 10, 1, 1).data]).toEqual([
    255, 0, 0, 255,
  ]);
  expect(canvas.viewportTransform).toEqual(viewport);
  expect({ width: canvas.width, height: canvas.height }).toEqual(dimensions);
});
it('retains the existing full-source capture for ordinary documents', () => {
  const { canvas, object } = fixture({ x: 10, y: 10, width: 20, height: 10 });
  vi.mocked(editingSurface.getEditorEditingDocumentSize).mockReturnValue({
    width: 100,
    height: 60,
  });
  expect(captureSource(canvas, object)).toMatchObject({
    width: 100,
    height: 60,
    bounds: { x: 0, y: 0, width: 100, height: 60 },
  });
});
it('refuses an oversized selection before rendering and permits a subsequent smaller selection', () => {
  const { canvas, object } = fixture({ x: 0, y: 0, width: 2500, height: 10000 });
  const render = vi.spyOn(canvas, 'renderCanvas');
  expect(() => captureSource(canvas, object)).toThrow();
  expect(render).not.toHaveBeenCalled();
  const smaller = createEditorDrawingSimplifyObject(
    {
      id: 'retry',
      kind: 'simplify',
      bounds: { x: 100, y: 9000, width: 200, height: 80 },
      settings: createDefaultSimplifySettings(),
    },
    2
  );
  canvas.remove(object);
  canvas.add(smaller);
  expect(captureSource(canvas, smaller).width).toBeGreaterThan(0);
});
