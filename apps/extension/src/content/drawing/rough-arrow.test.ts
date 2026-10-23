// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { DrawingObject } from '../../features/drawing/public';
import { drawRoughArrow } from './rough-arrow';

it.each([
  { id: 'bent-1', width: 12 },
  { id: 'bent-2', width: 12 },
  { id: 'bent-3', width: 12 },
  { id: 'bent-1', width: 24 },
  { id: 'bent-2', width: 24 },
  { id: 'bent-3', width: 24 },
])('keeps the curved shaft uniformly smooth for $id at width $width', ({ id, width }) => {
  const arrow: Extract<DrawingObject, { kind: 'arrow' }> = {
    id,
    kind: 'arrow',
    design: 'freehand',
    start: { x: 22, y: 37 },
    end: { x: 530, y: 286 },
    bendPoints: [
      { x: 90, y: 243 },
      { x: 219, y: 288 },
      { x: 440, y: 289 },
    ],
    color: '#ff5555',
    width,
    dynamicWidth: false,
  };
  const authored = JSON.stringify(arrow);
  const canvas = document.createElement('canvas');
  canvas.width = 582;
  canvas.height = 355;
  const context = canvas.getContext('2d')!;
  drawRoughArrow(context, arrow, { x: 0, y: 0 });
  const pixels = context.getImageData(320, 250, 150, 80).data;
  const coverage: number[] = [];
  for (let column = 0; column < 150; column += 1) {
    let alpha = 0;
    for (let row = 0; row < 80; row += 1) alpha += pixels[(row * 150 + column) * 4 + 3]!;
    coverage.push(alpha / 255);
  }
  expect(Math.min(...coverage)).toBeGreaterThan(2);
  expect(Math.max(...coverage) - Math.min(...coverage)).toBeLessThanOrEqual(0.5);
  expect(JSON.stringify(arrow)).toBe(authored);
});
