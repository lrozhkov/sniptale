import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isBoundedNumber } from '../../project/validation/primitives';
import { parseQuickEditSpotlight, createQuickEditSpotlight } from './focus';
import { fitQuickEditZoomTransitions } from './zoom';
import type { QuickEditRect } from './scene';
import type { QuickEditBorder, QuickEditZoomRegion } from './types';

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
      value['motion'] !== 'pulse') ||
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
      value['motion'] === 'pulse' || value['motion'] === 'counterclockwise'
        ? value['motion']
        : 'clockwise',
    style: value['style'],
    reveal: value['reveal'],
    exitReveal: value['exitReveal'],
  };
}

export interface QuickEditBorderFrame {
  id: string;
  path: string;
  perimeter: number;
  width: number;
  color: string;
  style: QuickEditBorder['style'];
  start: number;
  end: number;
  opacity: number;
  /** Canvas dash offset in scene pixels; absent legacy frames are stationary. */
  dashOffset?: number;
}

/** Clockwise circular-corner path, starting at top-center away from corner tangents. */
export function quickEditBorderPath(rect: QuickEditRect, radius: number) {
  const { x, y, width: w, height: h } = rect;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  // Chromium resets stroke dashes at degenerate arcs, so square corners use lines.
  if (r === 0)
    return {
      path: `M${x + w / 2} ${y}H${x + w}V${y + h}H${x}V${y}H${x + w / 2}Z`,
      perimeter: 2 * (w + h),
    };
  return {
    path:
      `M${x + w / 2} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
      `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
      `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
      `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w / 2}Z`,
    perimeter: 2 * (w + h - 4 * r) + 2 * Math.PI * r,
  };
}

const ease = (t: number, type: QuickEditZoomRegion['enter']['type']) => {
  const p = Math.max(0, Math.min(1, t));
  return type === 'none' ? 1 : type === 'linear' ? p : p * p * (3 - 2 * p);
};

function borderPhase(
  region: QuickEditZoomRegion,
  border: QuickEditBorder,
  time: number,
  geometry: { width: number; perimeter: number }
) {
  const clock = region.borderClock;
  const fitted = fitQuickEditZoomTransitions(region);
  const duration = clock?.duration ?? region.end - region.start;
  const enter = clock?.enter ?? fitted.enter;
  const exit = clock?.exit ?? fitted.exit;
  const t = clock ? clock.offset + (time - region.start) * clock.rate : time - region.start;
  const enterDuration = enter.type === 'none' ? 0 : enter.duration;
  const exitDuration = exit.type === 'none' ? 0 : exit.duration;
  const hold = Math.max(0, duration - enterDuration - exitDuration);
  const elapsed = Math.max(0, Math.min(t, duration - exitDuration) - enterDuration);
  const active = border.loop && hold > 0;
  const rotation = active && border.motion !== 'pulse' && border.style !== 'solid';
  const direction = border.motion === 'counterclockwise' ? -1 : 1;
  const pitch = geometry.width * (border.style === 'dashed' ? 5 : 2);
  const movement = rotation ? direction * elapsed * (2 / border.period) * pitch : 0;
  const holdInterval = () => {
    if (!rotation) return { start: 0, end: 1 };
    const shrink = Math.min(1, elapsed / Math.min(0.2, hold));
    const start = geometry.perimeter > 0 ? movement / geometry.perimeter : 0;
    return { start, end: start + 1 - (1 - border.segmentPercent / 100) * shrink };
  };
  let start = 0,
    end = 1,
    opacity = 1;
  if (t < enterDuration) {
    const p = ease(t / enterDuration, enter.type);
    if (border.reveal === 'draw') end = p;
    else if (border.reveal === 'draw-ccw') {
      start = -p;
      end = 0;
    } else opacity = p;
  } else {
    ({ start, end } = holdInterval());
    if (active && border.motion === 'pulse')
      opacity = 0.675 + 0.325 * Math.cos((2 * Math.PI * elapsed) / border.period);
    if (exitDuration > 0 && t > duration - exitDuration) {
      const p = ease((t - duration + exitDuration) / exitDuration, exit.type);
      if (border.exitReveal === 'erase') start += (end - start) * p;
      else if (border.exitReveal === 'erase-ccw') end -= (end - start) * p;
      else opacity *= 1 - p;
    }
  }
  const offset = Math.floor(start);
  return {
    start: start - offset,
    end: end - offset,
    opacity,
    movement,
  };
}

/** Timeline-only source clock; cuts skip phases and speed changes follow footage. */
export function evaluateQuickEditBordersAtTime(args: {
  regions: readonly QuickEditZoomRegion[];
  time: number;
  output: { width: number; height: number };
  video: QuickEditRect;
  scale: number;
}): QuickEditBorderFrame[] {
  return args.regions
    .filter(
      (region) =>
        !region.dormant && region.border && args.time >= region.start && args.time < region.end
    )
    .toSorted(
      (a, b) =>
        (a.sourceAnchor?.start ?? a.start) - (b.sourceAnchor?.start ?? b.start) ||
        a.id.localeCompare(b.id)
    )
    .map((region) => {
      const border = region.border!;
      const area = {
        x: args.video.x + border.area.x * args.video.width,
        y: args.video.y + border.area.y * args.video.height,
        width: border.area.width * args.video.width,
        height: border.area.height * args.video.height,
      };
      const width = Math.min(border.width * args.scale, area.width / 2, area.height / 2);
      const inset = width / 2;
      const rect = {
        x: area.x + inset,
        y: area.y + inset,
        width: Math.max(0, area.width - width),
        height: Math.max(0, area.height - width),
      };
      const path = quickEditBorderPath(
        rect,
        Math.max(0, Math.min(area.width, area.height) * border.roundness - inset)
      );
      const phase = borderPhase(region, border, args.time, { width, perimeter: path.perimeter });
      return {
        id: region.id,
        ...path,
        width,
        color: border.color,
        style: border.style,
        start: phase.start,
        end: phase.end,
        opacity: phase.opacity,
        dashOffset: 0 - phase.movement,
      };
    });
}
