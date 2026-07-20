import { expect, it } from 'vitest';

import { getEndpointOffsetVector, offsetArrowEndpointControlPoint } from './endpoint-geometry';

const settings = {
  arrowType: 'sharp',
  color: '#fff',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 1,
  shadow: 0,
  startHead: 'none',
  variant: 'standard',
  width: 12,
} as const;

it('offsets arrow endpoint handles along the endpoint tangent', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
  ];

  expect(getEndpointOffsetVector(0, points, settings)).toEqual({ x: -12, y: -0 });
  expect(getEndpointOffsetVector(1, points, settings)).toEqual({ x: 12, y: 0 });
  expect(offsetArrowEndpointControlPoint(points[0]!, points, 0, settings)).toEqual({
    x: -12,
    y: 0,
  });
});

it('falls back to default direction when endpoint tangent is missing', () => {
  expect(getEndpointOffsetVector(0, [{ x: 0, y: 0 }], { ...settings, width: 2 })).toEqual({
    x: -6,
    y: -0,
  });
  expect(getEndpointOffsetVector(1, [{ x: 0, y: 0 }], settings)).toEqual({ x: 0, y: 0 });
});
