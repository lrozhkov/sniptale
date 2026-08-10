// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createFabricCanvasFixture } from '../../../testing/fabric-canvas.test-support';
import { readEditorDrawingObject } from '../../../drawing/object/metadata';
import { createEditorDrawingFabricObject } from '../../../drawing/object/vector';
import { resizeLayerObject } from './resize';

it('persists text-box resize without scaling font size', () => {
  const object = createEditorDrawingFabricObject(
    {
      backgroundColor: null,
      bounds: { height: 34, width: 100, x: 20, y: 30 },
      color: '#111',
      fontFamily: 'handwritten',
      fontSize: 24,
      id: 'text-1',
      kind: 'text',
      text: 'Resize shared text wrapping',
    },
    1
  );
  const canvas = createFabricCanvasFixture({
    getObjects: () => [object],
    requestRenderAll: vi.fn(),
  });

  resizeLayerObject(
    canvas,
    'text-1',
    180,
    90,
    vi.fn(() => true)
  );

  const drawing = readEditorDrawingObject(object);
  expect(drawing).toMatchObject({ bounds: { width: 180 }, fontSize: 24, kind: 'text' });
  const reconstructed =
    drawing?.kind === 'text' ? createEditorDrawingFabricObject(drawing, 1) : object;
  expect(reconstructed.width).toBeCloseTo(180, 4);
});

it('persists representative vector layer resize into shared metadata', () => {
  const object = createEditorDrawingFabricObject(
    {
      bounds: { height: 20, width: 40, x: 10, y: 15 },
      color: '#f00',
      fillColor: null,
      id: 'shape-1',
      kind: 'rectangle',
      width: 4,
    },
    1
  );
  const canvas = createFabricCanvasFixture({
    getObjects: () => [object],
    requestRenderAll: vi.fn(),
  });

  resizeLayerObject(
    canvas,
    'shape-1',
    80,
    60,
    vi.fn(() => true)
  );

  const drawing = readEditorDrawingObject(object);
  expect(drawing).toMatchObject({ kind: 'rectangle' });
  const reconstructed =
    drawing && drawing.kind !== 'blur' ? createEditorDrawingFabricObject(drawing, 1) : object;
  expect(reconstructed.getScaledWidth()).toBeCloseTo(object.getScaledWidth(), 4);
  expect(reconstructed.getScaledHeight()).toBeCloseTo(object.getScaledHeight(), 4);
});
