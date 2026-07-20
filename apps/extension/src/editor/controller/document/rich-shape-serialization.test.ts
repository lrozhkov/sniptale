import { expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { collectRichShapeDocumentObjects, serializeCanvasObjects } from './';

it('returns no rich shape document objects when the canvas is unavailable', () => {
  expect(collectRichShapeDocumentObjects(null)).toEqual([]);
});

it('keeps rich shapes out of Fabric JSON and collects them as document objects', () => {
  const richDocumentObject = createDefaultRichShapeObject({
    frame: { height: 80, left: 0, top: 0, width: 120 },
    id: 'rich-1',
    shapeKind: 'rectangle',
  });
  const richShape = {
    height: 80,
    left: 10,
    sniptaleId: 'rich-1',
    sniptaleLocked: true,
    sniptaleRichShape: richDocumentObject,
    sniptaleType: 'rich-shape',
    scaleX: 1.5,
    scaleY: 1,
    toObject: vi.fn(() => ({ id: 'rich-json' })),
    top: 20,
    visible: true,
    width: 120,
  };
  const normalObject = { toObject: vi.fn(() => ({ id: 'normal' })) };
  const canvas = { getObjects: () => [normalObject, richShape] };

  expect(JSON.parse(serializeCanvasObjects(canvas as never))).toEqual({
    objects: [{ id: 'normal' }],
    version: '7.2.0',
  });
  expect(collectRichShapeDocumentObjects(canvas as never)).toEqual([
    expect.objectContaining({
      frame: { height: 80, left: 10, top: 20, width: 120 },
      id: 'rich-1',
      layer: expect.objectContaining({ locked: true }),
      scaleX: 1.5,
      shapeKind: 'rectangle',
    }),
  ]);
  expect(richShape.toObject).not.toHaveBeenCalled();
});
