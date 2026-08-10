// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { Canvas, Rect } from 'fabric';
import { collectLayers } from './layers';

function drawingObject(
  type: 'pencil' | 'marker' | 'shape' | 'arrow' | 'blur' | 'text',
  index: number
) {
  const object = new Rect({ fill: index % 2 ? '#f97316' : 'transparent', height: 20, width: 30 });
  object.sniptaleId = `${type}-${index}`;
  object.sniptaleLabel = `${type} ${index}`;
  object.sniptaleRole = 'annotation';
  object.sniptaleType = type;
  return object;
}

describe('drawing layers', () => {
  it('includes every shared editor drawing object in canonical canvas order', () => {
    const objects = (['pencil', 'marker', 'shape', 'arrow', 'blur', 'text'] as const).map(
      drawingObject
    );
    const canvas = new Canvas(document.createElement('canvas'));
    canvas.add(...objects);
    canvas.setActiveObject(objects[2]!);
    const layers = collectLayers(canvas);
    expect(layers.map((layer) => layer.type)).toEqual([
      'text',
      'blur',
      'arrow',
      'shape',
      'marker',
      'pencil',
    ]);
    expect(layers.find((layer) => layer.type === 'shape')).toMatchObject({
      selected: true,
      selectedCount: 1,
    });
    expect(layers.every((layer) => layer.raster === false)).toBe(true);
  });
});
