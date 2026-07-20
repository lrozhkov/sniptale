import { expect, it } from 'vitest';
import {
  createDefaultRichShapeCalloutGeometry,
  createDefaultRichShapeObject,
  type EditorBuiltInShapeGeometryDefinition,
} from '../../../features/editor/document/rich-shape';
import { resolveRichShapeTextFrame } from './text-frame/frame';

const insetGeometry: EditorBuiltInShapeGeometryDefinition = {
  type: 'path',
  viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
  paths: [
    {
      commands: [['M', 25, 10], ['L', 75, 10], ['L', 75, 90], ['L', 25, 90], ['Z']],
    },
  ],
};

it('aligns text to the visual geometry bounds before applying user insets', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 100, left: 0, top: 0, width: 200 },
    geometry: insetGeometry,
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

it('uses explicit geometry text frames for shapes whose contour is not their text area', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 200, left: 0, top: 0, width: 300 },
    geometry: {
      ...insetGeometry,
      textFrame: { height: 30, left: 20, top: 40, width: 50 },
    },
    text: {
      ...createDefaultRichShapeObject().text,
      insets: { bottom: 3, left: 2, right: 4, top: 1 },
    },
  });

  expect(resolveRichShapeTextFrame(shape)).toEqual({
    height: 56,
    left: 62,
    top: 81,
    width: 144,
  });
});

it('uses dynamic callout body as the text frame', () => {
  const frame = { height: 100, left: 0, top: 0, width: 180 };
  const callout = createDefaultRichShapeCalloutGeometry(frame, 'bottom');
  const shape = createDefaultRichShapeObject({
    callout,
    frame,
    shapeFamily: 'callout',
    shapeKind: 'dynamic-callout',
    text: {
      ...createDefaultRichShapeObject().text,
      insets: { bottom: 4, left: 6, right: 8, top: 2 },
    },
  });

  expect(resolveRichShapeTextFrame(shape)).toEqual({
    height: callout.body.height - 6,
    left: callout.body.left + 6,
    top: callout.body.top + 2,
    width: callout.body.width - 14,
  });
});

it('falls back to the full shape frame when no geometry is available', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 80, left: 0, top: 0, width: 120 },
    shapeKind: 'excalidraw-library-item',
    text: {
      ...createDefaultRichShapeObject().text,
      insets: { bottom: 4, left: 6, right: 8, top: 2 },
    },
  });

  expect(resolveRichShapeTextFrame(shape)).toEqual({
    height: 74,
    left: 6,
    top: 2,
    width: 106,
  });
});

it('falls back to viewBox bounds for empty path geometry', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 50, left: 0, top: 0, width: 100 },
    geometry: { paths: [{ commands: [] }], type: 'path', viewBox: insetGeometry.viewBox },
  });

  expect(resolveRichShapeTextFrame(shape)).toEqual({
    height: 34,
    left: 8,
    top: 8,
    width: 84,
  });
});

it('uses every command endpoint family when resolving visual text bounds', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 100, left: 0, top: 0, width: 100 },
    geometry: {
      paths: [
        {
          commands: [
            ['M', 20, 20],
            ['Q', 30, 10, 40, 40],
            ['C', 50, 5, 60, 80, 70, 30],
            ['A', 5, 5, 0, 0, 1, 80, 90],
          ],
        },
      ],
      type: 'path',
      viewBox: insetGeometry.viewBox,
    },
    text: {
      ...createDefaultRichShapeObject().text,
      insets: { bottom: 0, left: 0, right: 0, top: 0 },
    },
  });

  expect(resolveRichShapeTextFrame(shape)).toEqual({ height: 85, left: 20, top: 5, width: 60 });
});
