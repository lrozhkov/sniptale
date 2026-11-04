import { expect, it } from 'vitest';
import { reviewGpuAnnotationLayer } from './gpu-preview-annotations';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
} from '../../features/video/composition/motion/spatial-geometry';
it.each([0, 0.7, -0.5, Math.PI / 2])(
  'preserves the Canvas placement of external bitmap corners at rotation %s',
  (rotation) => {
    const bitmap = { width: 903, height: 173 } as ImageBitmap;
    const layer = reviewGpuAnnotationLayer(
      {
        instance: { transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.2, rotation } },
        bitmap,
        bitmapBounds: { x: -0.3, y: -0.2, width: 1.5, height: 1.4 },
      },
      { x: 20, y: 10, width: 800, height: 500 }
    );
    expect(layer.source).toBe(bitmap);
    expect(layer.rect).toEqual({ x: -256, y: -70, width: 480, height: 140 });
    const forward = invertQuickEditProjection(layer.inverse)!;
    for (const point of [
      { x: -256, y: -70 },
      { x: 224, y: 70 },
    ]) {
      const result = projectQuickEditPoint(forward, point)!;
      expect(result.x).toBeCloseTo(
        340 + point.x * Math.cos(rotation) - point.y * Math.sin(rotation),
        9
      );
      expect(result.y).toBeCloseTo(
        210 + point.x * Math.sin(rotation) + point.y * Math.cos(rotation),
        9
      );
    }
  }
);
it('uses the selected content or viewport plane without refitting a non-square raster', () => {
  const entry = {
    instance: { transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.4, rotation: 0 } },
    bitmap: { width: 811, height: 137 } as ImageBitmap,
    bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
  };
  const content = reviewGpuAnnotationLayer(entry, { x: 40, y: 30, width: 640, height: 360 });
  const viewport = reviewGpuAnnotationLayer(entry, { x: 0, y: 0, width: 1280, height: 720 });
  expect(content.rect.width).toBe(320);
  expect(content.rect.height).toBe(144);
  expect(viewport.rect.width).toBe(640);
  expect(viewport.rect.height).toBe(288);
  expect(content.source).toBe(entry.bitmap);
  expect(viewport.source).toBe(entry.bitmap);
});
