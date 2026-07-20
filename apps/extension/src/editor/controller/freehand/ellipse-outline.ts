import type { FreehandPointRecord } from './points';

export function buildEllipseOutline(options: {
  center: FreehandPointRecord;
  height: number;
  rotation: number;
  width: number;
}): FreehandPointRecord[] {
  const { center, height, rotation, width } = options;
  const radiusX = Math.max(width / 2, 1);
  const radiusY = Math.max(height / 2, 1);
  const stepCount = 48;
  const points = Array.from({ length: stepCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / stepCount;
    const localX = radiusX * Math.cos(angle);
    const localY = radiusY * Math.sin(angle);
    return {
      x: center.x + localX * Math.cos(rotation) - localY * Math.sin(rotation),
      y: center.y + localX * Math.sin(rotation) + localY * Math.cos(rotation),
    };
  });
  return [...points, { ...points[0]! }];
}
