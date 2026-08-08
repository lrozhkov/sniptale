import { parseColor } from '../color/index';
import {
  MAX_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS,
  PAINT_INTERPOLATION_SPACES,
  type Gradient,
  type GradientStop,
  type Paint,
} from './contracts';

const HEX_BYTE = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizePaintColor(value: string): string | null {
  const parsed = parseColor(value);
  return parsed
    ? `#${HEX_BYTE(parsed.red)}${HEX_BYTE(parsed.green)}${HEX_BYTE(parsed.blue)}${HEX_BYTE(parsed.alpha * 255)}`
    : null;
}

export function createSolidPaint(color: string): Paint {
  return { kind: 'solid', color: normalizePaintColor(color) ?? '#00000000' };
}

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function parseStops(value: unknown): GradientStop[] | null {
  if (
    !Array.isArray(value) ||
    value.length < MIN_GRADIENT_STOPS ||
    value.length > MAX_GRADIENT_STOPS
  ) {
    return null;
  }
  const ids = new Set<string>();
  const stops: Array<GradientStop & { sourceIndex: number }> = [];
  for (const [sourceIndex, item] of value.entries()) {
    if (
      !record(item) ||
      typeof item['id'] !== 'string' ||
      item['id'].length === 0 ||
      ids.has(item['id']) ||
      typeof item['color'] !== 'string' ||
      !finite(item['position']) ||
      (item['midpoint'] !== undefined && !finite(item['midpoint']))
    ) {
      return null;
    }
    const color = normalizePaintColor(item['color']);
    if (!color) return null;
    ids.add(item['id']);
    stops.push({
      id: item['id'],
      color,
      position: clamp(item['position'], 0, 1),
      midpoint: clamp(item['midpoint'] ?? 0.5, 0.01, 0.99),
      sourceIndex,
    });
  }
  stops.sort(
    (left, right) => left.position - right.position || left.sourceIndex - right.sourceIndex
  );
  return stops.map(({ sourceIndex: _sourceIndex, ...stop }) => stop);
}

const isInterpolationSpace = (value: unknown): value is Gradient['interpolation'] =>
  typeof value === 'string' && PAINT_INTERPOLATION_SPACES.some((candidate) => candidate === value);

function parseGradient(value: unknown): Gradient | null {
  if (
    !record(value) ||
    typeof value['type'] !== 'string' ||
    !['linear', 'radial', 'conic'].includes(value['type'])
  )
    return null;
  const stops = parseStops(value['stops']);
  const repeat = record(value['repeat']) ? value['repeat'] : null;
  const interpolation = isInterpolationSpace(value['interpolation'])
    ? value['interpolation']
    : null;
  if (
    !stops ||
    !repeat ||
    typeof repeat['enabled'] !== 'boolean' ||
    !finite(repeat['span']) ||
    !interpolation
  ) {
    return null;
  }
  const base = {
    stops,
    interpolation,
    repeat: { enabled: repeat['enabled'], span: clamp(repeat['span'], 0.01, 1) },
  };
  if (value['type'] === 'linear' && finite(value['angle'])) {
    return { ...base, type: 'linear', angle: normalizeAngle(value['angle']) };
  }
  const center = record(value['center']) ? value['center'] : null;
  if (!center || !finite(center['x']) || !finite(center['y'])) return null;
  const normalizedCenter = { x: clamp(center['x'], 0, 1), y: clamp(center['y'], 0, 1) };
  if (value['type'] === 'conic' && finite(value['startAngle'])) {
    return {
      ...base,
      type: 'conic',
      center: normalizedCenter,
      startAngle: normalizeAngle(value['startAngle']),
    };
  }
  const radius = record(value['radius']) ? value['radius'] : null;
  if (value['type'] !== 'radial' || !radius || !finite(radius['x']) || !finite(radius['y']))
    return null;
  return {
    ...base,
    type: 'radial',
    center: normalizedCenter,
    radius: { x: clamp(radius['x'], 0.01, 1), y: clamp(radius['y'], 0.01, 1) },
  };
}

export function parsePaint(value: unknown): Paint | null {
  if (!record(value) || (value['kind'] !== 'solid' && value['kind'] !== 'gradient')) return null;
  if (value['kind'] === 'solid') {
    const color = typeof value['color'] === 'string' ? normalizePaintColor(value['color']) : null;
    return color ? { kind: 'solid', color } : null;
  }
  const gradient = parseGradient(value['gradient']);
  return gradient ? { kind: 'gradient', gradient } : null;
}

export function normalizePaint(value: Paint): Paint {
  return parsePaint(value) ?? createSolidPaint('#00000000');
}

export function clonePaint(value: Paint): Paint {
  const canonical = parsePaint(value);
  if (!canonical) throw new TypeError('Cannot clone an invalid canonical Paint value');
  return structuredClone(canonical);
}

function semanticPaint(value: Paint): unknown {
  const normalized = clonePaint(value);
  if (normalized.kind === 'gradient') {
    normalized.gradient.stops = normalized.gradient.stops.map(({ id: _id, ...stop }) => ({
      id: '',
      ...stop,
    }));
  }
  return normalized;
}

export function arePaintsEqual(left: Paint, right: Paint): boolean {
  return JSON.stringify(semanticPaint(left)) === JSON.stringify(semanticPaint(right));
}
