import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isBoundedNumber } from '../validation/primitives';

/** An opening normalized over the decorated window; outside effects cover the composed scene. */
export interface QuickEditSpotlight {
  area: { x: number; y: number; width: number; height: number };
  effect: 'dim' | 'blur' | 'magnify';
  /** Lens strength and sampling; absent values keep authored spotlight history unchanged. */
  magnification?: number;
  lensOptics?: 'flat' | 'optical';
  strength: number;
  blur: number;
  roundness: number;
  reveal: 'fade' | 'contract';
  exitReveal: 'fade' | 'contract';
}

/** Window-normalized annotation, including decoration; transitions own immediate entrance/exit. */
export interface QuickEditBorder {
  area: { x: number; y: number; width: number; height: number };
  color: string;
  width: number;
  roundness: number;
  style: 'solid' | 'dashed' | 'dotted';
  reveal: 'fade' | 'draw' | 'draw-ccw';
  exitReveal: 'fade' | 'erase' | 'erase-ccw';
  loop: boolean;
  motion: 'clockwise' | 'counterclockwise' | 'pulse' | 'ripple';
  period: number;
  segmentPercent: number;
}

/** Validates persisted window coordinates and bounded scene effects without coercion. */
export function parseQuickEditSpotlight(value: unknown): QuickEditSpotlight | null {
  if (!isRecord(value) || !isRecord(value['area'])) return null;
  const area = value['area'];
  if (
    !isBoundedNumber(area['x'], 0, 1) ||
    !isBoundedNumber(area['y'], 0, 1) ||
    !isBoundedNumber(area['width'], 0.01, 1) ||
    !isBoundedNumber(area['height'], 0.01, 1) ||
    area['x'] + area['width'] > 1.0000001 ||
    area['y'] + area['height'] > 1.0000001 ||
    (value['effect'] !== 'dim' && value['effect'] !== 'blur' && value['effect'] !== 'magnify') ||
    (value['magnification'] !== undefined && !isBoundedNumber(value['magnification'], 1, 4)) ||
    (value['lensOptics'] !== undefined &&
      value['lensOptics'] !== 'flat' &&
      value['lensOptics'] !== 'optical') ||
    !isBoundedNumber(value['strength'], 0, 1) ||
    !isBoundedNumber(value['blur'], 0, 40) ||
    !isBoundedNumber(value['roundness'], 0, 0.5) ||
    (value['reveal'] !== 'fade' && value['reveal'] !== 'contract') ||
    (value['exitReveal'] !== undefined &&
      value['exitReveal'] !== 'fade' &&
      value['exitReveal'] !== 'contract')
  )
    return null;
  return {
    area: { x: area['x'], y: area['y'], width: area['width'], height: area['height'] },
    effect: value['effect'],
    ...(value['magnification'] === undefined ? {} : { magnification: value['magnification'] }),
    ...(value['lensOptics'] === undefined ? {} : { lensOptics: value['lensOptics'] }),
    strength: value['strength'],
    blur: value['blur'],
    roundness: value['roundness'],
    reveal: value['reveal'],
    exitReveal: value['exitReveal'] ?? value['reveal'],
  };
}

/** Stable, centered starting point for a new spotlight. */
export function createQuickEditSpotlight(): QuickEditSpotlight {
  return {
    area: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    effect: 'dim',
    strength: 0.65,
    blur: 12,
    roundness: 0.04,
    reveal: 'fade',
    exitReveal: 'fade',
  };
}

/** Clamp a dragged or numerically edited opening within the decorated window. */
export function clampQuickEditSpotlightArea(
  area: QuickEditSpotlight['area']
): QuickEditSpotlight['area'] {
  const width = Math.max(0.01, Math.min(1, area.width));
  const height = Math.max(0.01, Math.min(1, area.height));
  return {
    width,
    height,
    x: Math.max(0, Math.min(1 - width, area.x)),
    y: Math.max(0, Math.min(1 - height, area.y)),
  };
}

/** Move a lens around a normalized cursor point while retaining its authored dock and size. */
export function placeQuickEditLens(
  value: QuickEditSpotlight,
  point: { x: number; y: number } | null
): QuickEditSpotlight {
  if (value.effect !== 'magnify' || !point) return value;
  return {
    ...value,
    area: clampQuickEditSpotlightArea({
      ...value.area,
      x: point.x - value.area.width / 2,
      y: point.y - value.area.height / 2,
    }),
  };
}

/** Stable annotation defaults in authored scene pixels. */
export function createQuickEditBorder(): QuickEditBorder {
  return {
    area: createQuickEditSpotlight().area,
    color: '#ff8800ff',
    width: 3,
    roundness: 0.04,
    style: 'solid',
    reveal: 'fade',
    exitReveal: 'fade',
    loop: false,
    motion: 'clockwise',
    period: 2,
    segmentPercent: 100,
  };
}

/** Strict persisted annotation admission; no derived clock is accepted here. */
export function parseQuickEditBorder(value: unknown): QuickEditBorder | null {
  if (!isRecord(value)) return null;
  const area = parseQuickEditSpotlight({
    ...createQuickEditSpotlight(),
    area: value['area'],
  })?.area;
  const color = typeof value['color'] === 'string' ? normalizePaintColor(value['color']) : null;
  if (
    !area ||
    !color ||
    color !== value['color'] ||
    !isBoundedNumber(value['width'], 1, 24) ||
    !isBoundedNumber(value['roundness'], 0, 0.5) ||
    !isBoundedNumber(value['period'], 0.5, 20) ||
    ('segmentPercent' in value && !isBoundedNumber(value['segmentPercent'], 1, 100)) ||
    ('motion' in value &&
      value['motion'] !== 'clockwise' &&
      value['motion'] !== 'counterclockwise' &&
      value['motion'] !== 'pulse' &&
      value['motion'] !== 'ripple') ||
    typeof value['loop'] !== 'boolean' ||
    (value['style'] !== 'solid' && value['style'] !== 'dashed' && value['style'] !== 'dotted') ||
    (value['reveal'] !== 'fade' && value['reveal'] !== 'draw' && value['reveal'] !== 'draw-ccw') ||
    (value['exitReveal'] !== 'fade' &&
      value['exitReveal'] !== 'erase' &&
      value['exitReveal'] !== 'erase-ccw')
  )
    return null;
  return {
    area,
    color,
    width: value['width'],
    roundness: value['roundness'],
    period: value['period'],
    segmentPercent: typeof value['segmentPercent'] === 'number' ? value['segmentPercent'] : 25,
    // Retain authored history: normalizing this flag can collapse a stored toggle into a no-op.
    loop: value['loop'],
    motion:
      value['motion'] === 'pulse' ||
      value['motion'] === 'ripple' ||
      value['motion'] === 'counterclockwise'
        ? value['motion']
        : 'clockwise',
    style: value['style'],
    reveal: value['reveal'],
    exitReveal: value['exitReveal'],
  };
}
