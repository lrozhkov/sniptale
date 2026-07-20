import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createRoughPathObjects, createRoughPolylineObjects } from './rough-rendering';

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

it('uses independent rough fill opacity and stroke dash settings', () => {
  const shape = createDefaultRichShapeObject();
  shape.rough = {
    ...shape.rough,
    enabled: true,
    fillColor: '#123456',
    fillTransparency: 25,
  };

  expect(
    createRoughPathObjects({
      path: 'M 0 0 L 40 0 L 40 20 Z',
      seedOffset: 2147483647,
      shape,
      style: style as never,
    }).length
  ).toBeGreaterThan(0);
  expect(
    createRoughPolylineObjects({
      closed: false,
      points: [
        [0, 0],
        [40, 20],
      ],
      seedOffset: 0,
      shape,
      style: style as never,
    }).length
  ).toBeGreaterThan(0);
});

it('omits rough fill when transparency disables it', () => {
  const shape = createDefaultRichShapeObject();
  shape.rough = { ...shape.rough, enabled: true, fillTransparency: 1 };

  expect(
    createRoughPolylineObjects({
      closed: true,
      points: [
        [0, 0],
        [40, 0],
        [40, 20],
      ],
      seedOffset: 0,
      shape,
      style: style as never,
    }).length
  ).toBeGreaterThan(0);
});

it('falls back rough fill to the solid shape fill color', () => {
  const shape = createDefaultRichShapeObject();
  shape.rough = { ...shape.rough, enabled: true, fillTransparency: 0.25 };
  delete (shape.rough as { fillColor?: string }).fillColor;

  expect(
    createRoughPathObjects({
      path: 'M 0 0 L 10 0 L 10 10 Z',
      seedOffset: 0,
      shape,
      style: style as never,
    }).length
  ).toBeGreaterThan(0);
});

it('omits rough fill when no rough or solid fill color exists', () => {
  const shape = createDefaultRichShapeObject();
  shape.rough = { ...shape.rough, enabled: true, fillTransparency: 0.25 };
  shape.style = {
    ...shape.style,
    fill: {
      angle: 90,
      gradientType: 'linear',
      stops: [
        { color: '#ffffff', offset: 0, transparency: 0 },
        { color: '#000000', offset: 1, transparency: 0 },
      ],
      type: 'gradient',
    },
  };
  delete (shape.rough as { fillColor?: string }).fillColor;

  expect(
    createRoughPathObjects({
      path: 'M 0 0 L 10 0 L 10 10 Z',
      seedOffset: 0,
      shape,
      style: style as never,
    }).length
  ).toBeGreaterThan(0);
});
