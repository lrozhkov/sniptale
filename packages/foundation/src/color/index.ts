export const TRANSPARENT_COLOR = 'transparent';

export interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function unit(value: number): number {
  return clamp(value, 0, 1);
}

function parseHex(value: string): RgbaColor | null {
  const match = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match?.[1]) return null;
  const raw = match[1];
  const expanded = raw.length <= 4 ? [...raw].map((digit) => digit + digit).join('') : raw;
  const hasAlpha = expanded.length === 8;
  return {
    red: Number.parseInt(expanded.slice(0, 2), 16),
    green: Number.parseInt(expanded.slice(2, 4), 16),
    blue: Number.parseInt(expanded.slice(4, 6), 16),
    alpha: hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbChannel(value: string): number | null {
  const trimmed = value.trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return trimmed.endsWith('%') ? byte((parsed / 100) * 255) : byte(parsed);
}

function parseAlpha(value: string | undefined): number | null {
  if (value === undefined) return 1;
  const trimmed = value.trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return unit(trimmed.endsWith('%') ? parsed / 100 : parsed);
}

function splitFunctionalChannels(body: string): string[] {
  return body
    .replace(/\s*\/\s*/g, ',')
    .split(/(?:\s*,\s*|\s+)/)
    .filter(Boolean);
}

function parseRgb(value: string): RgbaColor | null {
  const match = value.match(/^rgba?\((.*)\)$/i);
  if (!match?.[1]) return null;
  const channels = splitFunctionalChannels(match[1]);
  if (channels.length < 3 || channels.length > 4) return null;
  const red = parseRgbChannel(channels[0] ?? '');
  const green = parseRgbChannel(channels[1] ?? '');
  const blue = parseRgbChannel(channels[2] ?? '');
  const alpha = parseAlpha(channels[3]);
  return red === null || green === null || blue === null || alpha === null
    ? null
    : { red, green, blue, alpha };
}

function hueToRgb(p: number, q: number, hue: number): number {
  let normalized = hue;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function parsePercent(value: string): number | null {
  if (!value.trim().endsWith('%')) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? unit(parsed / 100) : null;
}

function parseHsl(value: string): RgbaColor | null {
  const match = value.match(/^hsla?\((.*)\)$/i);
  if (!match?.[1]) return null;
  const channels = splitFunctionalChannels(match[1]);
  if (channels.length < 3 || channels.length > 4) return null;
  const hue = Number.parseFloat(channels[0] ?? '');
  const saturation = parsePercent(channels[1] ?? '');
  const lightness = parsePercent(channels[2] ?? '');
  const alpha = parseAlpha(channels[3]);
  if (!Number.isFinite(hue) || saturation === null || lightness === null || alpha === null) {
    return null;
  }
  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  if (saturation === 0) {
    const channel = byte(lightness * 255);
    return { red: channel, green: channel, blue: channel, alpha };
  }
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    red: byte(hueToRgb(p, q, normalizedHue + 1 / 3) * 255),
    green: byte(hueToRgb(p, q, normalizedHue) * 255),
    blue: byte(hueToRgb(p, q, normalizedHue - 1 / 3) * 255),
    alpha,
  };
}

export function parseColor(value: string): RgbaColor | null {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === TRANSPARENT_COLOR) {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }
  return parseHex(trimmed) ?? parseRgb(trimmed) ?? parseHsl(trimmed);
}

function hexByte(value: number): string {
  return byte(value).toString(16).padStart(2, '0');
}

export function formatHexColor(color: RgbaColor): string {
  const rgb = `#${hexByte(color.red)}${hexByte(color.green)}${hexByte(color.blue)}`;
  return unit(color.alpha) >= 1 ? rgb : `${rgb}${hexByte(unit(color.alpha) * 255)}`;
}

export function normalizeColor(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === TRANSPARENT_COLOR) return TRANSPARENT_COLOR;
  const parsed = parseColor(
    trimmed.startsWith('#') || /^(?:rgb|hsl)/i.test(trimmed) ? trimmed : `#${trimmed}`
  );
  return parsed ? formatHexColor(parsed) : null;
}

export function getColorAlpha(value: string): number | null {
  return parseColor(value)?.alpha ?? null;
}

export function setColorAlpha(value: string, alpha: number): string | null {
  const parsed = parseColor(value);
  return parsed ? formatHexColor({ ...parsed, alpha: unit(alpha) }) : null;
}

export function multiplyColorAlpha(value: string, multiplier: number): string | null {
  if (value.trim().toLowerCase() === TRANSPARENT_COLOR) return TRANSPARENT_COLOR;
  const parsed = parseColor(value);
  return parsed
    ? formatHexColor({ ...parsed, alpha: unit(parsed.alpha * unit(multiplier)) })
    : null;
}

export function replaceColorChannels(value: string, channels: string): string | null {
  const current = parseColor(value);
  const next = parseColor(channels);
  return current && next ? formatHexColor({ ...next, alpha: current.alpha }) : null;
}

export function hasVisibleColor(value: string | undefined): boolean {
  if (!value) return false;
  const alpha = getColorAlpha(value);
  return alpha === null ? value.trim().toLowerCase() !== TRANSPARENT_COLOR : alpha > 0;
}
