import type { CSSProperties } from 'react';
import { validateCssString } from '../css-sanitizer/css';
import {
  normalizeBorderPresetVisualFields,
  percentToUnit,
} from '@sniptale/ui/highlighter-style/normalize';
import type { BorderPadding, BorderPreset } from '@sniptale/ui/highlighter-style/types';

export interface ResolvedBorderPresetVisual {
  id: string;
  opacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
  strokeStyle: BorderPreset['style'];
  radius: number;
  shadow: BorderPreset['shadow'];
  fillColor: string;
  fillOpacity: number;
  inheritCustomCss: boolean;
  customCss: string;
  customCssStyles: CSSProperties;
  padding: BorderPadding;
}

function expandShortHex(hex: string): string {
  return hex
    .split('')
    .map((char) => char + char)
    .join('');
}

function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return expandShortHex(trimmed.slice(1));
  }

  if (/^#[0-9a-f]{4}$/i.test(trimmed)) {
    return expandShortHex(trimmed.slice(1, 4));
  }

  if (/^#[0-9a-f]{6}$/i.test(trimmed) || /^#[0-9a-f]{8}$/i.test(trimmed)) {
    return trimmed.slice(1, 7);
  }

  return null;
}

export function colorToRgba(color: string, opacityPercent: number): string {
  const opacity = percentToUnit(opacityPercent);
  const safeHex = normalizeHexColor(color);

  if (!safeHex) {
    return color;
  }

  const red = parseInt(safeHex.slice(0, 2), 16);
  const green = parseInt(safeHex.slice(2, 4), 16);
  const blue = parseInt(safeHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function resolveCustomCssStyles(preset: BorderPreset): CSSProperties {
  if (!preset.inheritCustomCss) {
    return {};
  }

  const validation = validateCssString(preset.customCss);
  if (validation.rawError || validation.hasBlockedProps) {
    return {};
  }

  return validation.styles;
}

export function resolveBorderPresetVisual(preset: BorderPreset): ResolvedBorderPresetVisual {
  const normalizedPreset = normalizeBorderPresetVisualFields(preset);

  return {
    id: normalizedPreset.id,
    opacity: normalizedPreset.opacity,
    strokeColor: normalizedPreset.color,
    strokeOpacity: normalizedPreset.strokeOpacity,
    strokeWidth: normalizedPreset.width,
    strokeStyle: normalizedPreset.style,
    radius: normalizedPreset.radius,
    shadow: normalizedPreset.shadow,
    fillColor: normalizedPreset.fillColor,
    fillOpacity: normalizedPreset.fillOpacity,
    inheritCustomCss: normalizedPreset.inheritCustomCss,
    customCss: normalizedPreset.customCss,
    customCssStyles: resolveCustomCssStyles(normalizedPreset),
    padding: normalizedPreset.padding,
  };
}
