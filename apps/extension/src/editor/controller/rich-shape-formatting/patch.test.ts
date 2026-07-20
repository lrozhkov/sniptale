import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { applyRichShapeFormattingPatch } from './patch';

function createNestedFormattingPatch() {
  return {
    effects: {
      reflection: { enabled: true, distance: 12 },
      shadow: { enabled: true, opacity: 0.25 },
    },
    callout: {
      body: { left: 0, top: 16, width: 120, height: 64 },
      tail: {
        side: 'top',
        baseStartRatio: 0.4,
        baseEndRatio: 0.6,
        tip: { x: 60, y: 0 },
      },
    },
    frame: { height: -1, left: 30, width: 0 },
    layer: { locked: true },
    rough: { fillWeight: 2, roughness: 1.8 },
    rotation: 33,
    style: {
      fillTransparency: 2,
      line: { dashStyle: 'dash-dot', width: 6 },
      opacity: 0.8,
    },
    text: {
      content: 'Nested',
      insets: { left: 12 },
      underline: true,
    },
  } as const;
}

it('merges nested formatting families and normalizes unsafe numeric values', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 80, left: 10, top: 20, width: 120 },
    text: {
      ...createDefaultRichShapeObject().text,
      insets: { bottom: 4, left: 4, right: 4, top: 4 },
    },
  });

  const next = applyRichShapeFormattingPatch(shape, createNestedFormattingPatch());

  expect(next.frame).toEqual({ height: 80, left: 30, top: 20, width: 120 });
  expect(next.callout?.tail.side).toBe('top');
  expect(next.layer.locked).toBe(true);
  expect(next.rough).toEqual(expect.objectContaining({ fillWeight: 2, roughness: 1.8 }));
  expect(next.rotation).toBe(33);
  expect(next.style.fillTransparency).toBe(1);
  expect(next.style.line).toEqual(expect.objectContaining({ dashStyle: 'dash-dot', width: 6 }));
  expect(next.effects.shadow).toEqual(expect.objectContaining({ enabled: true, opacity: 0.25 }));
  expect(next.effects.reflection).toEqual(expect.objectContaining({ enabled: true, distance: 12 }));
  expect(next.text.insets).toEqual({ bottom: 4, left: 12, right: 4, top: 4 });
  expect(next.text).toEqual(expect.objectContaining({ content: 'Nested', underline: true }));
});

it('leaves untouched families referentially stable when no patch is supplied', () => {
  const shape = createDefaultRichShapeObject();
  const next = applyRichShapeFormattingPatch(shape, {});

  expect(next.frame).toEqual(shape.frame);
  expect(next.style).toEqual(shape.style);
  expect(next.effects).toEqual(shape.effects);
  expect(next.text).toEqual(shape.text);
});
