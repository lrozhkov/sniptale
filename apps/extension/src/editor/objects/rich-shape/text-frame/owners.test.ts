import { expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  type EditorBuiltInShapeGeometryDefinition,
} from '../../../../features/editor/document/rich-shape';
import { resolveRichShapeGeometryBounds } from './bounds';
import { resolveRichShapeTextFrame } from './frame';
import { resolveRichShapeTextFrameGeometry } from './geometry';

const viewBox = { minX: 0, minY: 0, width: 100, height: 100 };

it('resolves geometry bounds from polyline points', () => {
  expect(
    resolveRichShapeGeometryBounds({
      closed: false,
      points: [
        [40, 5],
        [10, 70],
        [80, 30],
      ],
      type: 'polyline',
      viewBox,
    })
  ).toEqual({ maxX: 80, maxY: 70, minX: 10, minY: 5 });
});

it('keeps explicit text frame bounds ahead of visual contour bounds', () => {
  const geometry: EditorBuiltInShapeGeometryDefinition = {
    paths: [
      {
        commands: [
          ['M', 0, 0],
          ['L', 100, 100],
        ],
      },
    ],
    textFrame: { height: 40, left: 20, top: 30, width: 50 },
    type: 'path',
    viewBox,
  };

  expect(resolveRichShapeGeometryBounds(geometry)).toEqual({
    maxX: 70,
    maxY: 70,
    minX: 20,
    minY: 30,
  });
});

it('chooses stored shape geometry before built-in catalog geometry', () => {
  const geometry: EditorBuiltInShapeGeometryDefinition = {
    paths: [{ commands: [] }],
    type: 'path',
    viewBox,
  };
  const shape = createDefaultRichShapeObject({ geometry, shapeKind: 'rectangle' });

  expect(resolveRichShapeTextFrameGeometry(shape)).toBe(geometry);
});

it('applies text insets after visual frame resolution', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 100, left: 0, top: 0, width: 200 },
    geometry: {
      paths: [
        {
          commands: [
            ['M', 25, 10],
            ['L', 75, 90],
          ],
        },
      ],
      type: 'path',
      viewBox,
    },
    text: {
      ...createDefaultRichShapeObject().text,
      insets: { bottom: 7, left: 10, right: 14, top: 5 },
    },
  });

  expect(resolveRichShapeTextFrame(shape)).toEqual({
    height: 68,
    left: 60,
    top: 15,
    width: 76,
  });
});
