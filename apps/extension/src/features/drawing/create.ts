import { createDefaultSimplifySettings } from '../simplify/settings';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import type { DrawingObject, DrawingPoint, DrawingTool, DrawingToolDefaults } from './model';

export const createDrawingId = () => `drawing-${createSecureRandomUuid()}`;

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
      return {
        id,
        kind: 'arrow',
        start: point,
        end: point,
        color: defaults.arrow.color,
        design: defaults.arrow.design,
        dynamicWidth: defaults.arrow.dynamicWidth,
        width: defaults.arrow.width,
      };
    case 'simplify':
      return { id, kind: 'simplify', bounds, settings: { ...defaults.simplify } };
    case 'blur':
      if (defaults.blur.clean)
        return createDrawingCleanup({ id, kind: 'blur', bounds, amount: defaults.blur.amount });
      return { id, kind: 'blur', bounds, amount: defaults.blur.amount };
    case 'select':
    case 'text':
      return null;
  }
}

/** Reuses Simplify recognition while preserving the blur layer identity and geometry. */
export function createDrawingCleanup(
  object: Extract<DrawingObject, { kind: 'blur' }>
): Extract<DrawingObject, { kind: 'simplify' }> {
  return {
    id: object.id,
    kind: 'simplify',
    bounds: { ...object.bounds },
    ...(object.rotation === undefined ? {} : { rotation: object.rotation }),
    blurAmount: object.amount ?? 10,
    settings: {
      ...createDefaultSimplifySettings(),
      automatic: true,
      content: 'all',
      sensitivity: 90,
      erase: true,
    },
  };
}
