import { normalizeColor, parseColor, TRANSPARENT_COLOR } from '@sniptale/foundation/color';

export const COLOR_SELECTOR_TRANSPARENT = TRANSPARENT_COLOR;
export const COLOR_SELECTOR_MAX_OPTIONS = 10;
const COLOR_SELECTOR_DEFAULT_COLOR = '#f97316';

export interface RgbColor {
  blue: number;
  green: number;
  red: number;
}

export function clampRgbChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbToHex(color: RgbColor): string {
  return `#${[color.red, color.green, color.blue]
    .map((item) => clampRgbChannel(item).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function normalizeColorSelectorValue(value: string): string | null {
  return normalizeColor(value);
}

export function resolveColorSelectorDisplayValue(value: string): string {
  const normalized = normalizeColorSelectorValue(value);
  if (normalized === COLOR_SELECTOR_TRANSPARENT) {
    return COLOR_SELECTOR_TRANSPARENT;
  }

  return normalized ?? resolvePickerColor(value);
}

export function resolvePickerColor(value: string, fallback = COLOR_SELECTOR_DEFAULT_COLOR): string {
  const normalized = normalizeColorSelectorValue(value);
  return !normalized || normalized === COLOR_SELECTOR_TRANSPARENT ? fallback : normalized;
}

export function buildColorOptions(
  values: readonly string[],
  limit = COLOR_SELECTOR_MAX_OPTIONS
): string[] {
  const seen = new Set<string>();

  return values
    .map((item) => normalizeColorSelectorValue(item))
    .filter((item): item is string => Boolean(item) && item !== COLOR_SELECTOR_TRANSPARENT)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    })
    .slice(0, limit);
}

export function hexToRgb(value: string): RgbColor | null {
  if (value.trim().toLowerCase() === COLOR_SELECTOR_TRANSPARENT) return null;
  const parsed = parseColor(value);
  return parsed ? { red: parsed.red, green: parsed.green, blue: parsed.blue } : null;
}
