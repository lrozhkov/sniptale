// @vitest-environment jsdom

import { Textbox } from 'fabric';
import { expect, it } from 'vitest';
import { createEditorDrawingFabricObject, synchronizeEditorDrawingTextLayout } from './vector';

function create(text: string, fontSize = 24) {
  return createEditorDrawingFabricObject(
    {
      id: 'ink-bounds',
      kind: 'text',
      text,
      fontSize,
      fontFamily: 'sans',
      color: '#111111',
      backgroundColor: '#f97316',
      bounds: { x: 20, y: 30, width: 500, height: 60 },
    },
    1
  ) as Textbox;
}

it.each([16, 24, 36])('fits native cells symmetrically and contains the ink at %spx', (size) => {
  const object = create('привет', size);
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = object._getFontDeclaration();
  const ink = context.measureText(object.text);
  const x = object._getLeftOffset() + object._getLineLeftOffset(0);
  const y =
    object._getTopOffset() +
    (object.getHeightOfLine(0) / object.lineHeight) * (1 - object._fontSizeFraction);
  const left = x + object.width / 2;
  const right = object.width / 2 - x - ink.width;
  const ascent = ink.fontBoundingBoxAscent ?? size * 0.8;
  const descent = ink.fontBoundingBoxDescent ?? size * 0.2;
  expect(left).toBeCloseTo(right, 4);
  expect(y + object.height / 2 - ascent).toBeCloseTo(object.height / 2 - y - descent, 4);
  expect(left - ink.actualBoundingBoxLeft).toBeGreaterThanOrEqual(6 - 1e-6);
  expect(y + object.height / 2 - ink.actualBoundingBoxAscent).toBeGreaterThanOrEqual(6 - 1e-6);
});

it('retains whitespace without enlarging committed bounds or fill', () => {
  const plain = create('привет');
  const spaced = create('привет   \n\n');
  expect(spaced.width).toBeCloseTo(plain.width, 4);
  expect(spaced.height).toBeCloseTo(plain.height, 4);
  expect(spaced.text).toBe('привет   \n\n');
});

it('keeps already drawn glyph origins fixed while typing ascenders and descenders', () => {
  const object = create('с');
  const origin = () => ({
    x: object.getCenterPoint().x + object._getLeftOffset() + object._getLineLeftOffset(0),
    y: object.getCenterPoint().y + object._getTopOffset(),
  });
  const before = origin();
  object.set({ text: 'сф' });
  synchronizeEditorDrawingTextLayout(object);
  expect(origin().x).toBeCloseTo(before.x, 4);
  expect(origin().y).toBeCloseTo(before.y, 4);
});

it('preserves automatic wrapping, whitespace, identity and ink through native serialization', async () => {
  const { CUSTOM_JSON_PROPS } = await import('../../document/model/custom-json-props');
  const { applyEditorDrawingTextVisuals } = await import('./vector');
  const object = create('привет  \nмир\n');
  object.sniptaleDrawingTextMaxWidth = 420;
  const serialized = (object as import('fabric').FabricObject).toObject([...CUSTOM_JSON_PROPS]);
  const restored = await Textbox.fromObject(serialized);
  if (!(restored instanceof Textbox)) throw new Error('Expected textbox');
  applyEditorDrawingTextVisuals(restored);
  expect(restored.text).toBe(object.text);
  expect(restored.sniptaleId).toBe(object.sniptaleId);
  expect(restored.sniptaleDrawingTextAutoWidth).toBe(true);
  expect(restored.sniptaleDrawingTextMaxWidth).toBe(420);
  expect(restored.width).toBeCloseTo(object.width, 4);
  expect(restored.height).toBeCloseTo(object.height, 4);
});

it('preserves a manually chosen wrap column after serialization', async () => {
  const { applyEditorDrawingTextVisuals } = await import('./vector');
  const object = create('A line of text with enough words to wrap');
  object.set({ fontFamily: 'sans-serif' });
  object.sniptaleDrawingTextAutoWidth = false;
  object.set({ width: 130 });
  const lines = object._textLines.map((line) => line.join(''));
  expect(lines.length).toBeGreaterThan(1);
  const serialized = (object as import('fabric').FabricObject).toObject([
    'sniptaleDrawingTextAutoWidth',
    'sniptaleDrawingTextMaxWidth',
  ]);
  const restored = await Textbox.fromObject(serialized);
  if (!(restored instanceof Textbox)) throw new Error('Expected textbox');
  applyEditorDrawingTextVisuals(restored);
  expect(restored.width).toBe(130);
  expect(restored._textLines.map((line) => line.join(''))).toEqual(lines);
  expect(restored.height).toBeCloseTo(object.height, 4);
});

it('keeps pasted tab stops in Fabric glyph bounds and Canvas paint', () => {
  const object = create('A\tB\tC');
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = object._getFontDeclaration();
  const stop = context.measureText(' ').width * 8;
  expect(object.text).toBe('A\tB\tC');
  object.getLineWidth(0);
  expect(object.__charBounds[0]![2]!.left).toBeCloseTo(stop, 4);
  expect(object.__charBounds[0]![4]!.left).toBeCloseTo(stop * 2, 4);
  const calls: Array<{ text: string; x: number }> = [];
  const fill = context.fillText.bind(context);
  context.fillText = (text, x, y) => {
    calls.push({ text, x });
    fill(text, x, y);
  };
  object._renderTextFill(context);
  expect(calls.map((call) => call.text)).toEqual(['A', 'B', 'C']);
  expect(calls[1]!.x - calls[0]!.x).toBeCloseTo(stop, 4);
  expect(calls[2]!.x - calls[0]!.x).toBeCloseTo(stop * 2, 4);
  object.dispose();
});
