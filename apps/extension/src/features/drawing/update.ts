import { appendDrawingSample } from './freehand';
import { createDrawingBounds } from './geometry';
import type { DrawingObject, DrawingPoint, DrawingSample } from './model';

export type DrawingPointerModifiers = { ctrlKey: boolean; shiftKey: boolean };

export function resolveDrawingLinearPoint(args: {
  modifiers: DrawingPointerModifiers;
  point: DrawingPoint;
  start: DrawingPoint;
}): DrawingPoint {
  const deltaX = args.point.x - args.start.x;
  const deltaY = args.point.y - args.start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 0.001 || (args.modifiers.ctrlKey && !args.modifiers.shiftKey)) return args.point;
  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  const step = args.modifiers.shiftKey ? 15 : 45;
  const snapped = Math.round(angle / step) * step;
  if (!args.modifiers.shiftKey && Math.abs(snapped - angle) > 5) return args.point;
  const radians = (snapped * Math.PI) / 180;
  return {
    x: args.start.x + Math.cos(radians) * distance,
    y: args.start.y + Math.sin(radians) * distance,
  };
}

export function updateCreatedDrawingObject(args: {
  modifiers: DrawingPointerModifiers;
  object: DrawingObject;
  point: DrawingPoint;
  start: DrawingPoint;
  timestamp: number;
}): DrawingObject {
  const { modifiers, object, point, start, timestamp } = args;
  if (object.kind === 'pencil' || object.kind === 'marker') {
    if (modifiers.ctrlKey || modifiers.shiftKey) {
      const end = resolveDrawingLinearPoint({ modifiers, point, start });
      const first = object.samples[0] ?? { ...start, t: timestamp };
      return { ...object, samples: [first, { ...end, t: timestamp }] };
    }
    const sample: DrawingSample = { ...point, t: timestamp };
    return {
      ...object,
      samples: appendDrawingSample(object.samples, sample, object.kind === 'pencil'),
    };
  }
  if (object.kind === 'arrow') {
    return { ...object, end: resolveDrawingLinearPoint({ modifiers, point, start }) };
  }
  if ('bounds' in object) {
    let end = point;
    if (
      modifiers.shiftKey &&
      (object.kind === 'rectangle' ||
        object.kind === 'ellipse' ||
        object.kind === 'triangle' ||
        object.kind === 'parallelogram')
    ) {
      const size = Math.max(Math.abs(point.x - start.x), Math.abs(point.y - start.y));
      end = {
        x: start.x + Math.sign(point.x - start.x || 1) * size,
        y: start.y + Math.sign(point.y - start.y || 1) * size,
      };
    }
    return { ...object, bounds: createDrawingBounds(start, end) };
  }
  return object;
}
