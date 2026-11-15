// @vitest-environment jsdom

import { Canvas, Textbox } from 'fabric';
import { expect, it } from 'vitest';
import { canonicalizeModifiedEditorDrawingSelection } from './canonicalize';
import { createEditorDrawingFabricObject } from './vector';

it.each([0, 27])('keeps text pixels stable when a move at %s degrees is committed', (angle) => {
  const canvas = new Canvas(document.createElement('canvas'));
  const object = createEditorDrawingFabricObject(
    {
      backgroundColor: null,
      bounds: { height: 40, width: 180, x: 20, y: 30 },
      color: '#111',
      fontFamily: 'sans',
      fontSize: 24,
      id: 'moved-text',
      kind: 'text',
      text: 'A line of text',
    },
    1
  );
  if (!(object instanceof Textbox)) throw new Error('Expected text object');
  canvas.add(object);
  object.set({ angle, left: 80, top: 105 });
  object.setCoords();
  const glyphTop = object.getCenterPoint().y + object._getTopOffset();
  const height = object.height;
  const width = object.width;
  const fontSize = object.fontSize;
  const beforeImage = object.toCanvasElement();
  const beforePixels = beforeImage
    .getContext('2d')
    ?.getImageData(0, 0, beforeImage.width, beforeImage.height).data;

  const [replacement] =
    canonicalizeModifiedEditorDrawingSelection({
      canvas,
      object,
      prepareObject: () => undefined,
      source: null,
    }) ?? [];
  if (!(replacement instanceof Textbox)) throw new Error('Expected text replacement');

  expect(replacement.getCenterPoint().x).toBeCloseTo(object.getCenterPoint().x, 4);
  expect(replacement.getCenterPoint().y).toBeCloseTo(object.getCenterPoint().y, 4);
  expect(replacement.height).toBeCloseTo(height, 4);
  expect(replacement.width).toBeCloseTo(width, 4);
  expect(replacement.fontSize).toBe(fontSize);
  expect(replacement.getCenterPoint().y + replacement._getTopOffset()).toBeCloseTo(glyphTop, 4);
  const afterImage = replacement.toCanvasElement();
  const afterPixels = afterImage
    .getContext('2d')
    ?.getImageData(0, 0, afterImage.width, afterImage.height).data;
  expect(afterImage.width).toBe(beforeImage.width);
  expect(afterImage.height).toBe(beforeImage.height);
  expect(Buffer.from(afterPixels ?? []).equals(Buffer.from(beforePixels ?? []))).toBe(true);
  canvas.dispose();
});
