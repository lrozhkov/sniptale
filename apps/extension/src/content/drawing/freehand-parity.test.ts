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
  expect(drawingOutline.reduce((sum, point) => sum + point.x, 0)).toBeCloseTo(2208.688641201598, 8);
  expect(drawingOutline.reduce((sum, point) => sum + point.y, 0)).toBeCloseTo(2502.986298480992, 8);
  expect(drawingOutline[0]).toEqual({ x: 8.040055741721146, y: 24.172590429921307 });
  expect(drawingOutline[37]).toEqual({ x: 49.82458313003089, y: 39.77474331092914 });
  expect(drawingOutline.at(-1)).toEqual({ x: 7.026893352165332, y: 23.52314195740569 });
});
