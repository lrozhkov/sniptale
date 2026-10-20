import type { QuickEditSpotlight } from '../project/scene/focus-appearance';

type SceneSpotlightRect = QuickEditSpotlight['area'];

/** Pixel-space mask sample; blur is already scaled to the output canvas. */
export interface SceneSpotlightFrame {
  opening: SceneSpotlightRect;
  radius: number;
  dim: number;
  blur: number;
  protectionOpening?: SceneSpotlightRect;
  protectionRadius?: number;
  presence?: number;
  /** Contract clips expand by the same distance as the opening, keeping its center fixed. */
  openingClipProgress?: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Resolves an admitted opening in its attachment coordinate domain. */
export function resolveSceneSpotlightTarget(
  value: QuickEditSpotlight,
  video: SceneSpotlightRect,
  scale: number
): SceneSpotlightFrame {
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

/** Interpolates evaluated phases without reading either editor's timeline or state. */
export function sampleSceneSpotlight(args: {
  spotlight: QuickEditSpotlight;
  window: SceneSpotlightRect;
  extent: SceneSpotlightRect;
  scale: number;
  progress: number;
  phase: 'enter' | 'exit' | 'hold';
  from?: SceneSpotlightFrame;
}): SceneSpotlightFrame {
  const end = resolveSceneSpotlightTarget(args.spotlight, args.window, args.scale);
  const animation = args.phase === 'exit' ? args.spotlight.exitReveal : args.spotlight.reveal;
  const expanded = expandSpotlightOpening(end, args.extent);
  const start = args.from ?? {
    opening: animation === 'contract' ? expanded.opening : end.opening,
    radius: animation === 'contract' ? expanded.radius : 0,
    dim: 0,
    blur: 0,
  };
  const t = Math.max(0, Math.min(1, args.progress));
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
function expandSpotlightOpening(frame: SceneSpotlightFrame, output: SceneSpotlightRect) {
  const { opening, radius } = frame;
  const distance =
    Math.hypot(
      Math.max(0, opening.x - output.x, output.x + output.width - opening.x - opening.width),
      Math.max(0, opening.y - output.y, output.y + output.height - opening.y - opening.height)
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
export function sceneSpotlightPath(
  output: { width: number; height: number },
  frame: SceneSpotlightFrame
): string {
  return `M0 0H${output.width}V${output.height}H0Z ${sceneSpotlightOpeningPath(frame)}`;
}

/** Closed hole geometry shared by the SVG preview and Canvas mask. */
export function sceneSpotlightOpeningPath(
  frame: Pick<SceneSpotlightFrame, 'opening' | 'radius'>
): string {
  const { x, y, width: w, height: h } = frame.opening;
  const r = Math.max(0, Math.min(frame.radius, w / 2, h / 2));
  return (
    `M${x + r} ${y}H${x + w - r}` +
    `Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}` +
    `H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  );
}
