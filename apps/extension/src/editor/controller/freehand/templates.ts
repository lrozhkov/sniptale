import type { FreehandPointRecord } from './points';

function createRegularPolygonTemplatePoints(sides: number): FreehandPointRecord[] {
  const startAngle = -Math.PI / 2;
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / sides;

    return {
      x: 0.5 + Math.cos(angle) * 0.5,
      y: 0.5 + Math.sin(angle) * 0.5,
    };
  });

  return [...points, { ...points[0]! }];
}

function createEllipseTemplatePoints(): FreehandPointRecord[] {
  return Array.from({ length: 24 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 24;

    return {
      x: 0.5 + Math.cos(angle) * 0.5,
      y: 0.5 + Math.sin(angle) * 0.5,
    };
  });
}

export const FREEHAND_RECOGNITION_TEMPLATES = {
  arrow: [
    { x: 0, y: 0.5 },
    { x: 0.72, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0.72, y: 0.24 },
    { x: 1, y: 0.5 },
    { x: 0.72, y: 0.76 },
  ],
  diamond: [
    { x: 0.5, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 1 },
    { x: 0, y: 0.5 },
    { x: 0.5, y: 0 },
  ],
  ellipse: createEllipseTemplatePoints(),
  line: [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ],
  polygon3: createRegularPolygonTemplatePoints(3),
  polygon5: createRegularPolygonTemplatePoints(5),
  polygon6: createRegularPolygonTemplatePoints(6),
  polygon7: createRegularPolygonTemplatePoints(7),
  polygon8: createRegularPolygonTemplatePoints(8),
  rectangle: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 0, y: 0 },
  ],
} as const satisfies Record<string, readonly FreehandPointRecord[]>;
