import { parseRgbColor } from '../../color/parsing';
import { TRANSPARENT_COLOR } from '../../document/model';
import { parseColorForStore } from '../core/helpers';

function resolveHiddenColor(value: string): string | null {
  if (/^#[0-9a-f]{8}$/i.test(value) && value.slice(7, 9) === '00') {
    return value.slice(0, 7);
  }

  const rgba = parseRgbColor(value);
  if (!rgba || rgba.alpha !== 0) {
    return null;
  }

  const { red, green, blue } = rgba;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function resolveZeroOpacityColor(options: {
  fallback: string;
  preserveTransparentFallback?: boolean;
  value: unknown;
  opacity: number;
}): string {
  const { fallback, opacity, preserveTransparentFallback = false, value } = options;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return parseColorForStore(value, fallback);
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === TRANSPARENT_COLOR || normalized === 'none') {
    return TRANSPARENT_COLOR;
  }

  if (opacity !== 0) {
    return parseColorForStore(normalized, fallback);
  }

  const hiddenColor = resolveHiddenColor(normalized);
  if (hiddenColor) {
    return hiddenColor;
  }

  const parsed = parseColorForStore(normalized, fallback);
  return parsed === TRANSPARENT_COLOR && preserveTransparentFallback ? fallback : parsed;
}
