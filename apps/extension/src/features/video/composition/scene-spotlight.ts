import type { QuickEditSpotlight } from '../project/scene/focus-appearance';
import { resolveQuickEditLensArea } from '../project/scene/focus-appearance';

type SceneSpotlightRect = QuickEditSpotlight['area'];

/** Pixel-space mask sample; blur is already scaled to the output canvas. */
export interface SceneSpotlightFrame {
  opening: SceneSpotlightRect;
  radius: number;
  dim: number;
  blur: number;
  /** Original scene pixels inside the opening, magnified without moving the camera. */
  lens?: {
    scale: number;
    optics: 'flat' | 'optical';
    edgeWidth?: number;
    shape?: 'circle' | 'rounded';
  };
  /** Derived blend from legacy quadratic corners (0) to circular corners (1) in linked morphs. */
  arcMix?: number;
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
  const area = resolveQuickEditLensArea(value, video);
  const opening = {
    x: video.x + area.x * video.width,
    y: video.y + area.y * video.height,
    width: area.width * video.width,
    height: area.height * video.height,
  };
  return {
    opening,
    radius:
      Math.min(opening.width, opening.height) *
      (value.effect === 'magnify' && value.lensShape === 'circle' ? 0.5 : value.roundness),
    dim: value.effect === 'dim' ? value.strength : 0,
    blur: value.effect === 'blur' ? value.blur * scale : 0,
    ...(value.effect === 'magnify'
      ? {
          lens: {
            scale: value.magnification ?? 2,
            optics: value.lensOptics ?? 'flat',
            ...(value.lensShape === undefined ? {} : { shape: value.lensShape }),
            ...(value.lensEdgeWidth === undefined ? {} : { edgeWidth: value.lensEdgeWidth }),
          },
        }
      : {}),
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
  const start: SceneSpotlightFrame = args.from ?? {
    opening: animation === 'contract' ? expanded.opening : end.opening,
    radius:
      animation === 'contract' ? expanded.radius : end.lens?.shape === 'circle' ? end.radius : 0,
    dim: 0,
    blur: 0,
  };
  const t = Math.max(0, Math.min(1, args.progress));
  const lens = start.lens ?? end.lens;
  const shape =
    args.from && t === 0
      ? start.lens?.shape
      : args.from && t === 1
        ? end.lens?.shape
        : (end.lens?.shape ?? start.lens?.shape);
  const fromArc = start.lens?.shape ? 1 : 0,
    toArc = end.lens?.shape ? 1 : 0;
  return {
    opening: {
      x: mix(start.opening.x, end.opening.x, t),
      y: mix(start.opening.y, end.opening.y, t),
      width: mix(start.opening.width, end.opening.width, t),
      height: mix(start.opening.height, end.opening.height, t),
    },
    radius: mix(start.radius, end.radius, t),
    ...(args.from && fromArc !== toArc && t > 0 && t < 1 ? { arcMix: mix(fromArc, toArc, t) } : {}),
    dim: mix(start.dim, end.dim, t),
    blur: mix(start.blur, end.blur, t),
    ...(lens
      ? {
          lens: {
            scale: mix(start.lens?.scale ?? 1, end.lens?.scale ?? 1, t),
            optics: end.lens?.optics ?? start.lens!.optics,
            ...(shape === undefined ? {} : { shape }),
            ...(start.lens?.edgeWidth === undefined && end.lens?.edgeWidth === undefined
              ? {}
              : {
                  edgeWidth: mix(start.lens?.edgeWidth ?? 8, end.lens?.edgeWidth ?? 8, t),
                }),
          },
        }
      : {}),
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
  frame: Pick<SceneSpotlightFrame, 'opening' | 'radius' | 'lens' | 'arcMix'>
): string {
  const { x, y, width: w, height: h } = frame.opening;
  const r = Math.max(0, Math.min(frame.radius, w / 2, h / 2));
  if (frame.arcMix !== undefined && r > 0)
    return (
      `M${x + r} ${y}H${x + w - r}` +
      mixedCornerPath(x + w - r, y + r, r, 0, frame.arcMix) +
      `V${y + h - r}` +
      mixedCornerPath(x + w - r, y + h - r, r, 1, frame.arcMix) +
      `H${x + r}` +
      mixedCornerPath(x + r, y + h - r, r, 2, frame.arcMix) +
      `V${y + r}` +
      mixedCornerPath(x + r, y + r, r, 3, frame.arcMix) +
      'Z'
    );
  if (frame.lens?.shape && r > 0)
    return (
      `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
      `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
      `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
      `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    );
  return (
    `M${x + r} ${y}H${x + w - r}` +
    `Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}` +
    `H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  );
}

/** Two 45-degree cubics keep intermediate circular approximation error below 0.000005 × radius. */
function mixedCornerPath(
  x: number,
  y: number,
  radius: number,
  turn: number,
  blend: number
): string {
  const rotation = (turn * Math.PI) / 2;
  const cos = Math.cos(rotation),
    sin = Math.sin(rotation);
  const point = (a: number, b: number) =>
    `${x + radius * (a * cos - b * sin)} ${y + radius * (a * sin + b * cos)}`;
  const segments = [];
  const k = (4 / 3) * Math.tan(Math.PI / 16);
  for (let part = 0; part < 2; part++) {
    const a = part / 2,
      b = (part + 1) / 2;
    const theta = -Math.PI / 2 + (a * Math.PI) / 2,
      end = -Math.PI / 2 + (b * Math.PI) / 2;
    const quadratic = [
      [2 * a - a * a + (2 - 2 * a) / 6, -1 + a * a + (2 * a) / 6],
      [2 * b - b * b - (2 - 2 * b) / 6, -1 + b * b - (2 * b) / 6],
      [2 * b - b * b, -1 + b * b],
    ];
    const circular = [
      [Math.cos(theta) - k * Math.sin(theta), Math.sin(theta) + k * Math.cos(theta)],
      [Math.cos(end) + k * Math.sin(end), Math.sin(end) - k * Math.cos(end)],
      [Math.cos(end), Math.sin(end)],
    ];
    segments.push(
      'C' +
        quadratic
          .map((q, index) =>
            point(mix(q[0]!, circular[index]![0]!, blend), mix(q[1]!, circular[index]![1]!, blend))
          )
          .join(' ')
    );
  }
  return segments.join('');
}
