import {
  getAnnotationContentScale,
  getAnnotationInteractionScale,
} from '../../../project/annotation/render-metrics';

export function scaleAnnotationLength(value: number, displayScale: number): number {
  return value * getAnnotationContentScale(displayScale);
}

export function scaleAnnotationInteractionLength(value: number, displayScale: number): number {
  return value * getAnnotationInteractionScale(displayScale);
}

export function scaleAnnotationPoint(
  point: { x: number; y: number },
  displayScale: number
): { x: number; y: number } {
  return {
    x: scaleAnnotationLength(point.x, displayScale),
    y: scaleAnnotationLength(point.y, displayScale),
  };
}

export function scaleAnnotationRect(
  rect: { height: number; width: number; x: number; y: number },
  displayScale: number
): { height: number; width: number; x: number; y: number } {
  return {
    height: scaleAnnotationLength(rect.height, displayScale),
    width: scaleAnnotationLength(rect.width, displayScale),
    x: scaleAnnotationLength(rect.x, displayScale),
    y: scaleAnnotationLength(rect.y, displayScale),
  };
}
