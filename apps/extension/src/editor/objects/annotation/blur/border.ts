import type { FabricObject } from 'fabric';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { DEFAULT_BLUR_SETTINGS } from '../../../../features/highlighter/style/defaults';
import { hexToRgba } from '../../../document/model';
import type { BlurRuntimeObject } from './types';
import { createObjectFactoryStrokeDashArray } from '../../stroke-dash';

function resolveBorderPresetId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function resolveStrokeColor(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : (DEFAULT_BLUR_SETTINGS.strokeColor ?? '#475569');
}

function resolveStrokeStyle(value: unknown): NonNullable<BlurSettings['strokeStyle']> {
  return value === 'dashed' ||
    value === 'dotted' ||
    value === 'dash' ||
    value === 'dot' ||
    value === 'dash-dot' ||
    value === 'long-dash' ||
    value === 'solid'
    ? value
    : (DEFAULT_BLUR_SETTINGS.strokeStyle ?? 'solid');
}

function resolveStrokeWidth(value: unknown): number {
  return Math.max(
    0,
    Math.round(resolveFiniteNumber(value, DEFAULT_BLUR_SETTINGS.strokeWidth ?? 0))
  );
}

function resolveRadius(value: unknown): number {
  return Math.max(0, Math.round(resolveFiniteNumber(value, DEFAULT_BLUR_SETTINGS.radius ?? 0)));
}

function resolveShadow(value: unknown): NonNullable<BlurSettings['shadow']> {
  return Math.max(0, Math.round(resolveFiniteNumber(value, DEFAULT_BLUR_SETTINGS.shadow ?? 0)));
}

function resolveStrokeOpacity(value: unknown): number {
  return Math.min(
    1,
    Math.max(0, resolveFiniteNumber(value, DEFAULT_BLUR_SETTINGS.strokeOpacity ?? 1))
  );
}

export function applyBlurBorderStyle(object: BlurRuntimeObject, settings: BlurSettings): void {
  const radius = resolveRadius(settings.radius);

  object.set({
    fill: 'transparent',
    objectCaching: false,
    rx: radius,
    ry: radius,
    shadow: null,
    stroke: null,
    strokeDashArray: undefined,
    strokeUniform: true,
    strokeWidth: 0,
  });
}

export function getBlurFrameStyle(settings: BlurSettings): {
  radius: number;
  shadow: NonNullable<BlurSettings['shadow']>;
  stroke: string;
  strokeColor: string;
  strokeDashArray: number[] | undefined;
  strokeWidth: number;
  visible: boolean;
} {
  const strokeColor = resolveStrokeColor(settings.strokeColor);
  const strokeWidth = resolveStrokeWidth(settings.strokeWidth);
  const visible = (settings.showBorder ?? true) && strokeWidth > 0;
  const strokeStyle = resolveStrokeStyle(settings.strokeStyle);
  const strokeOpacity = resolveStrokeOpacity(settings.strokeOpacity);

  return {
    radius: resolveRadius(settings.radius),
    shadow: resolveShadow(settings.shadow),
    stroke: hexToRgba(strokeColor, strokeOpacity),
    strokeColor,
    strokeDashArray: createObjectFactoryStrokeDashArray(strokeStyle, strokeWidth, {
      dashDotGapMultiplier: 1.9,
    }),
    strokeWidth,
    visible,
  };
}

export function applyBlurBorderMetadata(object: BlurRuntimeObject, settings: BlurSettings): void {
  object.sniptaleBlurStrokeColor = resolveStrokeColor(settings.strokeColor);
  object.sniptaleBlurStrokeStyle = resolveStrokeStyle(settings.strokeStyle);
  object.sniptaleBlurStrokeWidth = resolveStrokeWidth(settings.strokeWidth);
  object.sniptaleBorderPresetId = resolveBorderPresetId(settings.borderPresetId);
  delete object.sniptaleShapeStrokeStyle;
  object.sniptaleShapeRadius = resolveRadius(settings.radius);
  object.sniptaleShapeShadow = resolveShadow(settings.shadow);
  object.sniptaleShapeStrokeOpacity = resolveStrokeOpacity(settings.strokeOpacity);
  object.sniptaleShapeFillOpacity = 0;
  object.sniptaleShapeCustomCss = '';
  object.sniptaleShapeInheritCustomCss = false;
}

export function getBlurBorderSettings(object: FabricObject) {
  return {
    borderPresetId: resolveBorderPresetId(object.sniptaleBorderPresetId),
    radius: resolveRadius(object.sniptaleShapeRadius),
    shadow: resolveShadow(object.sniptaleShapeShadow),
    strokeColor: resolveStrokeColor(object.sniptaleBlurStrokeColor),
    strokeOpacity: resolveStrokeOpacity(object.sniptaleShapeStrokeOpacity),
    strokeStyle: resolveStrokeStyle(
      object.sniptaleBlurStrokeStyle ?? object.sniptaleShapeStrokeStyle
    ),
    strokeWidth: resolveStrokeWidth(object.sniptaleBlurStrokeWidth),
  };
}
