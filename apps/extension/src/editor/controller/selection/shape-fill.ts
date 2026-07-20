import type { EditorShapeSettings } from '../../../features/editor/document/types';
import { resolveZeroOpacityColor } from './zero-opacity-color';

export function resolveShapeFillColor(
  fill: unknown,
  fillOpacity: number,
  fallback: EditorShapeSettings['fillColor']
): EditorShapeSettings['fillColor'] {
  return resolveZeroOpacityColor({
    fallback,
    opacity: fillOpacity,
    preserveTransparentFallback: true,
    value: fill,
  });
}

export function resolveShapeStrokeColor(
  stroke: unknown,
  strokeOpacity: number,
  fallback: EditorShapeSettings['strokeColor']
): EditorShapeSettings['strokeColor'] {
  return resolveZeroOpacityColor({
    fallback,
    opacity: strokeOpacity,
    preserveTransparentFallback: true,
    value: stroke,
  });
}
