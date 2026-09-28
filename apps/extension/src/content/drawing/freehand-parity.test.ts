import { expect, it } from 'vitest';
import { buildDrawingStrokeOutline, type DrawingSample } from '../../features/drawing/public';

it('keeps page pencil geometry identical to the speed-based image-editor pencil', () => {
  const samples: DrawingSample[] = [
    { x: 10, y: 20, t: 0 },
    { x: 12, y: 22, t: 12 },
    { x: 24, y: 25, t: 20 },
    { x: 32, y: 42, t: 60 },
    { x: 48, y: 44, t: 90 },
  ];
  const drawingOutline = buildDrawingStrokeOutline(samples, 16, {
    dynamicWidth: true,
    smoothingLevel: 10,
  });
  // Frozen from the image-editor dynamic-width path for this exact mouse-speed sample set.
  expect(drawingOutline).toHaveLength(76);
  expect(drawingOutline.reduce((sum, point) => sum + point.x, 0)).toBeCloseTo(2203.918933986989, 8);
  expect(drawingOutline.reduce((sum, point) => sum + point.y, 0)).toBeCloseTo(2505.427084892861, 8);
  expect(drawingOutline[0]).toEqual({ x: 8.087290717470228, y: 24.194633271076817 });
  expect(drawingOutline[37]).toEqual({ x: 49.564329384611824, y: 39.671205433815445 });
  expect(drawingOutline.at(-1)).toEqual({ x: 7.066813728046293, y: 23.556659018281408 });
});
