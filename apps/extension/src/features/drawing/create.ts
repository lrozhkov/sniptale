import type { DrawingObject, DrawingPoint, DrawingTool, DrawingToolDefaults } from './model';

export const createDrawingId = () => `drawing-${crypto.randomUUID()}`;

export function createDrawingObject(
  tool: DrawingTool,
  point: DrawingPoint,
  timestamp: number,
  defaults: DrawingToolDefaults
): DrawingObject | null {
  const id = createDrawingId();
  const bounds = { x: point.x, y: point.y, width: 0, height: 0 };
  switch (tool) {
    case 'pencil':
      return { id, kind: 'pencil', samples: [{ ...point, t: timestamp }], ...defaults.pencil };
    case 'marker':
      return { id, kind: 'marker', samples: [{ ...point, t: timestamp }], ...defaults.marker };
    case 'shape':
      return { id, bounds, ...defaults.shape };
    case 'arrow':
      return { id, kind: 'arrow', start: point, end: point, ...defaults.arrow };
    case 'blur':
      return { id, kind: 'blur', bounds };
    case 'select':
    case 'text':
      return null;
  }
}
