import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isBoundedNumber } from '../../project/validation/primitives';
import { sampleQuickEditFocusAtTime, type QuickEditRect } from './scene';
import type { QuickEditSpotlight, QuickEditZoomRegion } from './types';

/** Validates persisted source coordinates and bounded scene effects without coercion. */
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
    (value['effect'] !== 'dim' && value['effect'] !== 'blur') ||
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

/** Clamp a dragged or numerically edited opening within the source frame. */
export function clampQuickEditSpotlightArea(area: QuickEditRect): QuickEditRect {
  const width = Math.max(0.01, Math.min(1, area.width));
  const height = Math.max(0.01, Math.min(1, area.height));
  return {
    width,
    height,
    x: Math.max(0, Math.min(1 - width, area.x)),
    y: Math.max(0, Math.min(1 - height, area.y)),
  };
}

/** Pixel-space mask sample; blur is already scaled to the output canvas. */
export interface QuickEditSpotlightFrame {
  opening: QuickEditRect;
  radius: number;
  dim: number;
  blur: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function targetFrame(
  value: QuickEditSpotlight,
  video: QuickEditRect,
  scale: number
): QuickEditSpotlightFrame {
  const opening = {
    x: video.x + value.area.x * video.width,
    y: video.y + value.area.y * video.height,
    width: value.area.width * video.width,
    height: value.area.height * video.height,
  };
  return {
    opening,
    radius: Math.min(opening.width, opening.height) * value.roundness,
    dim: value.effect === 'dim' ? value.strength : 0,
    blur: value.effect === 'blur' ? value.blur * scale : 0,
  };
}

/** Samples the same deterministic phase and pixel geometry for DOM preview and canvas export. */
export function evaluateQuickEditSpotlightAtTime(args: {
  regions: readonly QuickEditZoomRegion[];
  time: number;
  output: { width: number; height: number };
  video: QuickEditRect;
  scale: number;
}): QuickEditSpotlightFrame | null {
  const sample = sampleQuickEditFocusAtTime(args.regions, args.time);
  if (!sample?.to.spotlight) return null;
  const end = targetFrame(sample.to.spotlight, args.video, args.scale);
  const animation =
    sample.phase === 'exit' ? sample.to.spotlight.exitReveal : sample.to.spotlight.reveal;
  const start = sample.from?.spotlight
    ? targetFrame(sample.from.spotlight, args.video, args.scale)
    : {
        opening: animation === 'contract' ? { x: 0, y: 0, ...args.output } : end.opening,
        radius: 0,
        dim: 0,
        blur: 0,
      };
  const t = sample.progress;
  return {
    opening: {
      x: mix(start.opening.x, end.opening.x, t),
      y: mix(start.opening.y, end.opening.y, t),
      width: mix(start.opening.width, end.opening.width, t),
      height: mix(start.opening.height, end.opening.height, t),
    },
    radius: mix(start.radius, end.radius, t),
    dim: mix(start.dim, end.dim, t),
    blur: mix(start.blur, end.blur, t),
  };
}

/** Numeric even-odd path shared by CSS clipping and Canvas Path2D. */
export function quickEditSpotlightPath(
  output: { width: number; height: number },
  frame: QuickEditSpotlightFrame
): string {
  const { x, y, width: w, height: h } = frame.opening;
  const r = Math.max(0, Math.min(frame.radius, w / 2, h / 2));
  return (
    `M0 0H${output.width}V${output.height}H0Z M${x + r} ${y}H${x + w - r}` +
    `Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}` +
    `H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  );
}
