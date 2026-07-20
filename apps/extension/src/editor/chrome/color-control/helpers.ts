import { TRANSPARENT_COLOR } from '../../document/model';
import { parseRgbColor } from '../../color/parsing';
import { EDITOR_CANVAS_ACCENT } from '../../color/palette/constants';

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase() === TRANSPARENT_COLOR) {
    return TRANSPARENT_COLOR;
  }

  const rgbaColor = parseRgbColor(trimmed);
  if (rgbaColor) {
    if (rgbaColor.alpha === 0) {
      return TRANSPARENT_COLOR;
    }

    const { red, green, blue } = rgbaColor;
    return `#${[red, green, blue].map((item) => item.toString(16).padStart(2, '0')).join('')}`;
  }

  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase()}`;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) {
    return normalized.slice(7, 9) === '00'
      ? TRANSPARENT_COLOR
      : normalized.slice(0, 7).toLowerCase();
  }

  return null;
}

export function resolvePreviewColor(value: string, fallback = EDITOR_CANVAS_ACCENT): string {
  const normalized = normalizeHexColor(value);
  return !normalized || normalized === TRANSPARENT_COLOR ? fallback : normalized;
}

export function buildUniqueColorList(values: readonly string[], limit = 10): string[] {
  const seen = new Set<string>();
  return values
    .map((item) => normalizeHexColor(item))
    .filter((item): item is string => Boolean(item) && item !== TRANSPARENT_COLOR)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    })
    .slice(0, limit);
}
