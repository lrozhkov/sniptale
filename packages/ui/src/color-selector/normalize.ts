export const COLOR_SELECTOR_TRANSPARENT = 'transparent';
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

function parseRgbChannel(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? clampRgbChannel(parsed) : null;
}

function parseRgbColor(value: string): RgbColor | null {
  const normalized = value.trim();
  const rgbMatch = normalized.match(/^rgba?\((.+)\)$/i);
  if (!rgbMatch) {
    return null;
  }

  const rgbChannels = rgbMatch[1];
  if (!rgbChannels) {
    return null;
  }

  const parts = rgbChannels
    .replace('/', ',')
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const red = parseRgbChannel(parts[0] ?? '');
  const green = parseRgbChannel(parts[1] ?? '');
  const blue = parseRgbChannel(parts[2] ?? '');

  return red === null || green === null || blue === null ? null : { red, green, blue };
}

export function rgbToHex(color: RgbColor): string {
  return `#${[color.red, color.green, color.blue]
    .map((item) => clampRgbChannel(item).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function normalizeColorSelectorValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase() === COLOR_SELECTOR_TRANSPARENT) {
    return COLOR_SELECTOR_TRANSPARENT;
  }

  const rgbColor = parseRgbColor(trimmed);
  if (rgbColor) {
    return rgbToHex(rgbColor);
  }

  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split('')
      .map((item) => item + item)
      .join('')
      .toLowerCase()}`;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) {
    return normalized.slice(7, 9) === '00'
      ? COLOR_SELECTOR_TRANSPARENT
      : normalized.slice(0, 7).toLowerCase();
  }

  return null;
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
  const normalized = normalizeColorSelectorValue(value);
  if (!normalized || normalized === COLOR_SELECTOR_TRANSPARENT) {
    return null;
  }

  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}
