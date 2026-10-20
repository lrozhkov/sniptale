import { type QuickEditSpotlight } from '../../project/scene/focus-appearance';
import { resolveQuickEditFocusLink } from './focus-layout';
import { sampleQuickEditFocusAtTime, type QuickEditRect } from './scene';
import type { QuickEditZoomRegion } from './types';

/** Pixel-space mask sample; blur is already scaled to the output canvas. */
export interface QuickEditSpotlightFrame {
  opening: QuickEditRect;
  radius: number;
  dim: number;
  blur: number;
  protectionOpening?: QuickEditRect;
  protectionRadius?: number;
  presence?: number;
  /** Contract clips expand by the same distance as the opening, keeping its center fixed. */
  openingClipProgress?: number;
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
  const sample = sampleQuickEditFocusAtTime(
    args.regions.filter((region) => region.spotlight),
    args.time,
    args.regions
  );
  if (!sample?.to.spotlight) return null;
  const end = targetFrame(sample.to.spotlight, args.video, args.scale);
  const animation =
    sample.phase === 'exit' ? sample.to.spotlight.exitReveal : sample.to.spotlight.reveal;
  const expanded = expandSpotlightOpening(end, args.output);
  const start = sample.from?.spotlight
    ? targetFrame(sample.from.spotlight, args.video, args.scale)
    : {
        opening: animation === 'contract' ? expanded.opening : end.opening,
        radius: animation === 'contract' ? expanded.radius : 0,
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

/** Parallel outward edges and rounded corners cover the farthest output corner without panning. */
function expandSpotlightOpening(
  frame: QuickEditSpotlightFrame,
  output: { width: number; height: number }
) {
  const { opening, radius } = frame;
  const distance =
    Math.hypot(
      Math.max(0, opening.x, output.width - opening.x - opening.width),
      Math.max(0, opening.y, output.height - opening.y - opening.height)
    ) + radius;
  return {
    opening: {
      x: opening.x - distance,
      y: opening.y - distance,
      width: opening.width + 2 * distance,
      height: opening.height + 2 * distance,
    },
    radius: radius + distance,
  };
}

/** Numeric even-odd path shared by CSS clipping and Canvas Path2D. */
export function quickEditSpotlightPath(
  output: { width: number; height: number },
  frame: QuickEditSpotlightFrame
): string {
  return `M0 0H${output.width}V${output.height}H0Z ${quickEditSpotlightOpeningPath(frame)}`;
}

/** Closed hole geometry shared by the SVG preview and Canvas mask. */
export function quickEditSpotlightOpeningPath(
  frame: Pick<QuickEditSpotlightFrame, 'opening' | 'radius'>
): string {
  const { x, y, width: w, height: h } = frame.opening;
  const r = Math.max(0, Math.min(frame.radius, w / 2, h / 2));
  return (
    `M${x + r} ${y}H${x + w - r}` +
    `Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}` +
    `H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  );
}

/** All independent masks, with final protection holes and linked morph presence. */
export function evaluateQuickEditSpotlightsAtTime(
  args: Parameters<typeof evaluateQuickEditSpotlightAtTime>[0]
): QuickEditSpotlightFrame[] {
  const regions = args.regions.filter((region) => !region.dormant && region.spotlight);
  const frames: QuickEditSpotlightFrame[] = [];
  for (const region of regions) {
    const link = resolveQuickEditFocusLink(args.regions, region.id);
    if (link && args.time >= region.end && args.time < link.target.start) {
      const frame = evaluateQuickEditSpotlightAtTime({ ...args, regions: [region, link.target] });
      if (frame)
        frames.push({
          ...frame,
          protectionOpening: frame.opening,
          protectionRadius: frame.radius,
          presence: 1,
          openingClipProgress: 1,
        });
      continue;
    }
    if (args.time < region.start || args.time >= region.end) continue;
    const incoming = regions.find(
      (item) => resolveQuickEditFocusLink(args.regions, item.id)?.target.id === region.id
    );
    const connected = [...(incoming ? [incoming] : []), region, ...(link ? [link.target] : [])];
    const sample = sampleQuickEditFocusAtTime(connected, args.time);
    const frame = evaluateQuickEditSpotlightAtTime({ ...args, regions: connected });
    if (!frame || !sample) continue;
    const target = targetFrame(region.spotlight!, args.video, args.scale);
    const reveal =
      sample.phase === 'exit' ? region.spotlight!.exitReveal : region.spotlight!.reveal;
    frames.push({
      ...frame,
      protectionOpening: target.opening,
      protectionRadius: target.radius,
      presence: sample.progress,
      openingClipProgress: reveal === 'contract' ? sample.progress : 1,
    });
  }
  return frames;
}
