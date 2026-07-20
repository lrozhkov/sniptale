import { Shadow } from 'fabric';
import type { BorderPreset } from '../../features/highlighter/contracts';
import {
  normalizeBorderShadowIntensity,
  resolveBorderShadowVisual,
} from '../../features/highlighter/style';
import { hexToRgba, isTransparentColor } from '../document/model';

type EditorShadowPreset = BorderPreset['shadow'];
type EditorShadowOptions = {
  affectStroke?: boolean;
  angle?: number;
  blur?: number;
  distance?: number;
};

export function normalizeShadowPreset(value: unknown): EditorShadowPreset {
  return normalizeBorderShadowIntensity(value);
}

function roundShadowOffset(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveCanonicalNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function resolveShadow(
  shadow: unknown,
  color: string,
  affectStroke: boolean,
  options: EditorShadowOptions
) {
  const normalizedShadow = normalizeShadowPreset(shadow);
  if (normalizedShadow === 0 || isTransparentColor(color)) {
    return null;
  }

  if (typeof options.blur === 'number' || typeof options.distance === 'number') {
    const angle = ((options.angle ?? 90) * Math.PI) / 180;
    const distance = resolveCanonicalNumber(options.distance, 4);
    return {
      affectStroke,
      blur: resolveCanonicalNumber(options.blur, 12),
      color: hexToRgba(color, normalizedShadow / 100),
      offsetX: roundShadowOffset(Math.cos(angle) * distance),
      offsetY: roundShadowOffset(Math.sin(angle) * distance),
    };
  }

  const angle = typeof options.angle === 'number' ? options.angle : 90;
  const resolvedShadow = resolveBorderShadowVisual(normalizedShadow, color, angle).fabric;
  if (!resolvedShadow) {
    return null;
  }

  return {
    affectStroke,
    ...resolvedShadow,
  };
}

export function createFabricShadow(
  shadow: unknown,
  color: string,
  options: EditorShadowOptions = {}
): Shadow | undefined {
  const resolved = resolveShadow(shadow, color, options.affectStroke ?? true, options);
  return resolved ? new Shadow(resolved) : undefined;
}

export function applyCanvasShadow(
  context: CanvasRenderingContext2D,
  shadow: unknown,
  color: string,
  options: EditorShadowOptions = {}
): void {
  const resolved = resolveShadow(shadow, color, false, options);

  context.shadowColor = resolved?.color ?? 'transparent';
  context.shadowBlur = resolved?.blur ?? 0;
  context.shadowOffsetX = resolved?.offsetX ?? 0;
  context.shadowOffsetY = resolved?.offsetY ?? 0;
}
