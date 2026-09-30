// @vitest-environment jsdom

import { Canvas } from 'fabric';
import { expect, it } from 'vitest';
import type { DrawingObject } from '../../../features/drawing/public';
import { serializeCanvasObjects } from '../../controller/document/serialization';
import { readEditorDrawingObject } from './metadata';
import { createEditorDrawingFabricObject } from './vector';

it('keeps drawing alpha through Fabric save and reopen, including legacy opacity', async () => {
  const drawings: Exclude<DrawingObject, { kind: 'blur' }>[] = [
    {
      bounds: { x: 5, y: 5, width: 30, height: 25 },
      color: '#ff000080',
      fillColor: '#0000ff00',
      id: 'shape-alpha',
      kind: 'rectangle',
      width: 4,
    },
    {
      color: '#00ff0040',
      id: 'marker-alpha',
      kind: 'marker',
      opacity: 1,
      samples: [
        { x: 50, y: 5, t: 0 },
        { x: 80, y: 25, t: 1 },
      ],
      width: 12,
    },
    {
      color: '#ffff00',
      id: 'marker-legacy',
      kind: 'marker',
      opacity: 0.3,
      samples: [
        { x: 50, y: 35, t: 0 },
        { x: 80, y: 55, t: 1 },
      ],
      width: 12,
    },
    {
      bounds: { x: 5, y: 35, width: 80, height: 35 },
      color: '#1122337f',
      backgroundColor: '#ffffff00',
      fontSize: 24,
      id: 'text-alpha',
      kind: 'text',
      text: 'Alpha',
    },
  ];
  const canvas = new Canvas(document.createElement('canvas'));
  drawings.forEach((drawing, index) =>
    canvas.add(createEditorDrawingFabricObject(drawing, index + 1))
  );
  const saved = serializeCanvasObjects(canvas);
  const reopened = new Canvas(document.createElement('canvas'));
  await reopened.loadFromJSON(saved);
  const restored = reopened.getObjects().map(readEditorDrawingObject);
  expect(restored).toHaveLength(drawings.length);
  drawings.forEach((drawing, index) => {
    expect(restored[index]).toMatchObject({
      id: drawing.id,
      kind: drawing.kind,
      color: drawing.color,
    });
    if ('fillColor' in drawing)
      expect(restored[index]).toMatchObject({ fillColor: drawing.fillColor });
    if ('backgroundColor' in drawing)
      expect(restored[index]).toMatchObject({ backgroundColor: drawing.backgroundColor });
    if ('opacity' in drawing) expect(restored[index]).toMatchObject({ opacity: drawing.opacity });
  });
  expect(reopened.getObjects()[0]).toMatchObject({ stroke: '#ff000080', fill: '#0000ff00' });
  expect(reopened.getObjects()[1]).toMatchObject({ fill: '#00ff0040', opacity: 1 });
  expect(reopened.getObjects()[2]).toMatchObject({ fill: '#ffff00', opacity: 0.3 });
  expect(reopened.getObjects()[3]).toMatchObject({
    fill: '#1122337f',
    textBackgroundColor: '#ffffff00',
  });
  expect(JSON.parse(saved).objects).toHaveLength(drawings.length);
  canvas.dispose();
  reopened.dispose();
});
