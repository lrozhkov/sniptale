import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createRoughOptions, resolveRoughFill, transparencyToOpacity } from './rough-options';

const style = {
  fill: '#ffffff',
  opacity: 1,
  shadow: null,
  stroke: '#f97316',
  strokeDashArray: [4, 2],
  strokeLineCap: 'round',
  strokeLineJoin: 'round',
  strokeWidth: 4,
} as const;

it('resolves rough fill opacity from decimal transparency values', () => {
  const shape = createDefaultRichShapeObject();

  shape.rough = { ...shape.rough, fillColor: '#123456', fillTransparency: 0.25 };
  expect(resolveRoughFill(shape)).toBe('rgba(18, 52, 86, 0.75)');
  expect(transparencyToOpacity(25)).toBe(0.75);
  expect(transparencyToOpacity(Number.POSITIVE_INFINITY)).toBe(1);
});

it('falls back rough fill to solid shape fill and omits disabled fill', () => {
  const shape = createDefaultRichShapeObject();

  shape.rough = { ...shape.rough, fillTransparency: 0.25 };
  delete (shape.rough as { fillColor?: string }).fillColor;
  expect(resolveRoughFill(shape)).toBe('rgba(255, 255, 255, 0.75)');

  shape.rough = { ...shape.rough, fillTransparency: 1 };
  expect(resolveRoughFill(shape)).toBeUndefined();
});

it('creates rough options with wrapped seeds, fill-specific settings, and stroke dash', () => {
  const shape = createDefaultRichShapeObject();

  shape.rough = {
    ...shape.rough,
    bowing: 2,
    fillBowing: 3,
    fillRoughness: 4,
    roughness: 5,
    seed: 2147483646,
  };

  expect(
    createRoughOptions({
      fill: '#ffffff',
      seedOffset: 2,
      shape,
      style: style as never,
    })
  ).toMatchObject({
    bowing: 3,
    fill: '#ffffff',
    roughness: 4,
    seed: 3,
    stroke: '#f97316',
    strokeLineDash: [4, 2],
  });
});
