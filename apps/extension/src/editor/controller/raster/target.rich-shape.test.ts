// @vitest-environment jsdom

import { Point } from 'fabric';
import { expect, it } from 'vitest';
import {
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCatalogEntry,
} from '../../../features/editor/document/rich-shape';
import { createRichShapeCatalogObject } from '../../objects/rich-shape';
import { resolveBitmapPoint } from './target';

function getCatalogEntry(id: string): EditorBuiltInShapeCatalogEntry {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

it('maps the visible rich-shape center into the bitmap center', () => {
  const shape = createRichShapeCatalogObject({
    entry: getCatalogEntry('rectangle'),
    height: 90,
    id: 'shape-1',
    labelIndex: 1,
    left: 120,
    top: 80,
    width: 160,
  });
  shape.setCoords();

  const sceneBounds = shape.getBoundingRect();
  const bitmap = {
    height: Math.round(sceneBounds.height),
    width: Math.round(sceneBounds.width),
  };

  const bitmapPoint = resolveBitmapPoint({
    canvas: {} as never,
    reference: { kind: 'object', objectId: 'shape-1', objectName: 'Rectangle' },
    scenePoint: new Point(
      sceneBounds.left + sceneBounds.width / 2,
      sceneBounds.top + sceneBounds.height / 2
    ),
    snapshot: {
      bitmap,
      reference: { kind: 'object', objectId: 'shape-1', objectName: 'Rectangle' },
      sceneBounds,
    } as never,
    targetObject: shape,
  });

  expect(bitmapPoint).toEqual({
    x: Math.round(bitmap.width / 2),
    y: Math.round(bitmap.height / 2),
  });
});

it('does not clamp outside rich-shape pointer coordinates into the bitmap edge', () => {
  const shape = createRichShapeCatalogObject({
    entry: getCatalogEntry('rectangle'),
    height: 90,
    id: 'shape-1',
    labelIndex: 1,
    left: 120,
    top: 80,
    width: 160,
  });
  shape.setCoords();

  const sceneBounds = shape.getBoundingRect();
  const bitmap = {
    height: Math.round(sceneBounds.height),
    width: Math.round(sceneBounds.width),
  };

  expect(
    resolveBitmapPoint({
      canvas: {} as never,
      reference: { kind: 'object', objectId: 'shape-1', objectName: 'Rectangle' },
      scenePoint: new Point(sceneBounds.left - 12, sceneBounds.top + 24),
      snapshot: {
        bitmap,
        reference: { kind: 'object', objectId: 'shape-1', objectName: 'Rectangle' },
        sceneBounds,
      } as never,
      targetObject: shape,
    })
  ).toBeNull();
});
