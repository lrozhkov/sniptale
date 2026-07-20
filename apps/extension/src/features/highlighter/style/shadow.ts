import { colorToRgba } from './visual';
import { normalizeBorderShadowIntensity } from '@sniptale/ui/highlighter-style/normalize';

export const BORDER_SHADOW_SOFT_INTENSITY = 30;
export const BORDER_SHADOW_HARD_INTENSITY = 100;

interface FabricShadowStyle {
  blur: number;
  color: string;
  offsetX: number;
  offsetY: number;
}

export interface ResolvedBorderShadowVisual {
  enabled: boolean;
  intensity: number;
  fabric: FabricShadowStyle | null;
  frameBoxShadow: string | undefined;
  hoverBoxShadow: string | undefined;
  settingsPreviewBoxShadow: string | undefined;
  settingsRowBoxShadow: string | undefined;
  stepBadgeBoxShadow: string | undefined;
}

export function formatBorderShadowIntensityValue(shadow: unknown): string {
  return `${normalizeBorderShadowIntensity(shadow)}/100`;
}

function interpolateFromAnchors(intensity: number, softValue: number, hardValue: number): number {
  if (intensity <= 0) {
    return 0;
  }

  if (intensity <= BORDER_SHADOW_SOFT_INTENSITY) {
    return (intensity / BORDER_SHADOW_SOFT_INTENSITY) * softValue;
  }

  return (
    softValue +
    ((intensity - BORDER_SHADOW_SOFT_INTENSITY) /
      (BORDER_SHADOW_HARD_INTENSITY - BORDER_SHADOW_SOFT_INTENSITY)) *
      (hardValue - softValue)
  );
}

function formatShadowNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '');
}

function toPx(value: number): string {
  return value === 0 ? '0' : `${formatShadowNumber(value)}px`;
}

function mixColor(color: string, strength: number): string {
  return `color-mix(in srgb, ${color} ${formatShadowNumber(strength)}%, transparent)`;
}

function buildCssShadowEntry(args: {
  color: string;
  blur: number;
  opacity: number;
  offsetX?: number;
  offsetY?: number;
  spread?: number;
}): string {
  const parts = [toPx(args.offsetX ?? 0), toPx(args.offsetY ?? 0), toPx(args.blur)];

  if ((args.spread ?? 0) !== 0) {
    parts.push(toPx(args.spread ?? 0));
  }

  parts.push(mixColor(args.color, args.opacity));
  return parts.join(' ');
}

function createFrameBoxShadow(intensity: number, color: string): string {
  return buildCssShadowEntry({
    color,
    blur: interpolateFromAnchors(intensity, 15, 24),
    opacity: interpolateFromAnchors(intensity, 32, 52),
    spread: interpolateFromAnchors(intensity, 0, 4),
  });
}

function createHoverBoxShadow(intensity: number, color: string): string {
  const primaryHoverShadow = buildCssShadowEntry({
    color,
    blur: interpolateFromAnchors(intensity, 8, 14),
    opacity: interpolateFromAnchors(intensity, 38, 60),
    spread: interpolateFromAnchors(intensity, 0, 2),
  });
  const hoverGlowOpacity = interpolateFromAnchors(intensity, 18, 8);
  const hoverBoxShadow =
    hoverGlowOpacity > 0
      ? [
          primaryHoverShadow,
          buildCssShadowEntry({
            color,
            blur: interpolateFromAnchors(intensity, 16, 24),
            opacity: hoverGlowOpacity,
          }),
        ].join(', ')
      : primaryHoverShadow;

  return hoverBoxShadow;
}

function roundShadowOffset(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function createFabricShadowWithAngle(
  intensity: number,
  color: string,
  angleDegrees: number
): FabricShadowStyle {
  const distance = interpolateFromAnchors(intensity, 0, 2);
  const angle = (angleDegrees * Math.PI) / 180;

  return {
    blur: interpolateFromAnchors(intensity, 10, 16),
    color: colorToRgba(color, interpolateFromAnchors(intensity, 25, 42)),
    offsetX: roundShadowOffset(Math.cos(angle) * distance),
    offsetY: roundShadowOffset(Math.sin(angle) * distance),
  };
}

function createSettingsPreviewBoxShadow(intensity: number, color: string): string {
  return buildCssShadowEntry({
    color,
    blur: interpolateFromAnchors(intensity, 15, 22),
    opacity: interpolateFromAnchors(intensity, 50, 78),
    spread: interpolateFromAnchors(intensity, 0, 4),
  });
}

function createSettingsRowBoxShadow(intensity: number, color: string): string {
  return buildCssShadowEntry({
    color,
    blur: interpolateFromAnchors(intensity, 6, 9),
    opacity: interpolateFromAnchors(intensity, 40, 62),
    spread: interpolateFromAnchors(intensity, 0, 2),
  });
}

function createStepBadgeBoxShadow(intensity: number, color: string): string {
  return buildCssShadowEntry({
    color,
    blur: interpolateFromAnchors(intensity, 10, 16),
    opacity: interpolateFromAnchors(intensity, 40, 64),
    offsetY: interpolateFromAnchors(intensity, 0, 2),
  });
}

function createEmptyShadowVisual(intensity: number): ResolvedBorderShadowVisual {
  return {
    enabled: false,
    intensity,
    fabric: null,
    frameBoxShadow: undefined,
    hoverBoxShadow: undefined,
    settingsPreviewBoxShadow: undefined,
    settingsRowBoxShadow: undefined,
    stepBadgeBoxShadow: undefined,
  };
}

export function resolveBorderShadowVisual(
  shadow: unknown,
  color: string,
  angleDegrees = 90
): ResolvedBorderShadowVisual {
  const intensity = normalizeBorderShadowIntensity(shadow);
  if (intensity === 0) {
    return createEmptyShadowVisual(intensity);
  }

  return {
    enabled: true,
    intensity,
    fabric: createFabricShadowWithAngle(intensity, color, angleDegrees),
    frameBoxShadow: createFrameBoxShadow(intensity, color),
    hoverBoxShadow: createHoverBoxShadow(intensity, color),
    settingsPreviewBoxShadow: createSettingsPreviewBoxShadow(intensity, color),
    settingsRowBoxShadow: createSettingsRowBoxShadow(intensity, color),
    stepBadgeBoxShadow: createStepBadgeBoxShadow(intensity, color),
  };
}
