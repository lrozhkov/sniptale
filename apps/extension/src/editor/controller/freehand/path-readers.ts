import type { FabricObject } from 'fabric';
import type { EditorBrushSettings } from '../../../features/editor/document/types';
import { parseRgbColor } from '../../color/parsing';

export function readFreehandSmoothingLevel(
  object: FabricObject,
  fallback: EditorBrushSettings['smoothingLevel']
): EditorBrushSettings['smoothingLevel'] {
  return typeof object.sniptaleBrushSmoothing === 'number'
    ? object.sniptaleBrushSmoothing
    : fallback;
}

export function readFreehandShadowAngle(
  object: FabricObject,
  fallback: EditorBrushSettings['shadowAngle']
): number {
  return typeof object.sniptaleBrushShadowAngle === 'number'
    ? object.sniptaleBrushShadowAngle
    : (fallback ?? 90);
}

export function readFreehandShadowColor(
  object: FabricObject,
  fallback: EditorBrushSettings['shadowColor']
): string {
  return typeof object.sniptaleBrushShadowColor === 'string'
    ? object.sniptaleBrushShadowColor
    : (fallback ?? '#000000');
}

export function readFreehandShadowDistance(
  object: FabricObject,
  fallback: EditorBrushSettings['shadowDistance']
): number {
  return typeof object.sniptaleBrushShadowDistance === 'number'
    ? object.sniptaleBrushShadowDistance
    : (fallback ?? 4);
}

export function readFreehandShadowBlur(
  object: FabricObject,
  fallback: EditorBrushSettings['shadowBlur']
): number {
  return typeof object.sniptaleBrushShadowBlur === 'number'
    ? object.sniptaleBrushShadowBlur
    : (fallback ?? 12);
}

export function readFreehandDynamicWidth(
  object: FabricObject,
  fallback: EditorBrushSettings['dynamicWidth']
): boolean {
  return typeof object.sniptaleBrushDynamicWidth === 'boolean'
    ? object.sniptaleBrushDynamicWidth
    : fallback === true;
}

export function readFreehandWidth(
  object: FabricObject,
  fallback: EditorBrushSettings['width']
): EditorBrushSettings['width'] {
  if (typeof object.sniptaleBrushWidth === 'number') {
    return object.sniptaleBrushWidth;
  }
  if (object.sniptaleBrushDynamicWidth === true && object.strokeWidth === 0) {
    return fallback;
  }
  return typeof object.strokeWidth === 'number' ? object.strokeWidth : fallback;
}

export function readFreehandColorInput(object: FabricObject): unknown {
  return object.sniptaleBrushDynamicWidth === true ? object.fill : object.stroke;
}

export function readFreehandOpacity(
  object: FabricObject,
  fallback: EditorBrushSettings['opacity']
): number {
  const colorInput = readFreehandColorInput(object);
  if (typeof colorInput === 'string') {
    const rgba = parseRgbColor(colorInput);
    if (rgba?.alpha !== null && rgba?.alpha !== undefined) {
      return rgba.alpha;
    }
    const normalized = colorInput.trim().toLowerCase();
    if (/^#[0-9a-f]{8}$/i.test(normalized)) {
      return Number.parseInt(normalized.slice(7, 9), 16) / 255;
    }
  }
  return typeof object.opacity === 'number' ? object.opacity : fallback;
}
