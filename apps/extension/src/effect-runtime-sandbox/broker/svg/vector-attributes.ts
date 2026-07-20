const MAX_ID_CHARACTERS = 512;

export function assertBoundedSvgId(value: string): string {
  if (value.length === 0 || value.length > MAX_ID_CHARACTERS) {
    throw new Error('EFFECT_SVG_VALUE_INVALID');
  }
  return value;
}

export function parseSvgViewBox(
  value: string | null,
  fallback: { height?: number; width?: number }
): { height: number; width: number } {
  const parts = String(value ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
    return { height: parts[3]!, width: parts[2]! };
  }
  return {
    height: readPositiveFallback(fallback.height),
    width: readPositiveFallback(fallback.width),
  };
}

export function readSvgAttribute(
  node: Element,
  name: string,
  fallback: string | null
): string | null {
  const value = node.getAttribute(name);
  return value === null || value === '' ? fallback : value;
}

export function readFiniteSvgAttribute(node: Element, name: string, fallback: number): number {
  const value = node.getAttribute(name);
  if (value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('EFFECT_SVG_VALUE_INVALID');
  return number;
}

export function readNonNegativeSvgAttribute(node: Element, name: string, fallback: number): number {
  const value = readFiniteSvgAttribute(node, name, fallback);
  if (value < 0) throw new Error('EFFECT_SVG_VALUE_INVALID');
  return value;
}

export function normalizeSvgPaint(value: string | null): string | null {
  return !value || value.toLowerCase() === 'none' ? null : value;
}

export function clampSvgValue(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readPositiveFallback(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1;
}
