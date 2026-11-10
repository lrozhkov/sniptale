import {
  hasExactKeys,
  isPlainRecord as isRecord,
} from '@sniptale/runtime-contracts/validation/primitives';

/** Evaluated drawing operands. The sandbox broker does not interpret EffectV1 expressions. */
export type EffectRuntimeGpuBlend =
  | 'source-over'
  | 'lighter'
  | 'screen'
  | 'source-atop'
  | 'destination-in';

export interface EffectRuntimeGpuRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Native Canvas affine order: a, b, c, d, e, f. Coordinates include the physical raster scale. */
export type EffectRuntimeGpuTransform = readonly [number, number, number, number, number, number];

/** The fixed Canvas filter order is blur, brightness, then saturate. */
export interface EffectRuntimeGpuFilter {
  blur: number;
  brightness: number;
  saturate: number;
}

export interface EffectRuntimeGpuShadow {
  color: readonly [number, number, number, number];
  blur: number;
  offsetX: number;
  offsetY: number;
}

/** Every bitmap has one transfer owner; operation and pass references contain only numeric IDs. */
export interface EffectRuntimeGpuRasterResource {
  id: number;
  kind: 'input' | 'asset-clone' | 'primitive' | 'coverage';
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export type EffectRuntimeGpuSource = { kind: 'resource' | 'pass'; id: number };

export interface EffectRuntimeGpuDraw {
  op: 'draw';
  source: EffectRuntimeGpuSource;
  sourceRect: EffectRuntimeGpuRect;
  destination: EffectRuntimeGpuRect;
  transform: EffectRuntimeGpuTransform;
  alpha: number;
  blend: EffectRuntimeGpuBlend;
  filter: EffectRuntimeGpuFilter;
  shadow: EffectRuntimeGpuShadow;
  coverage?: number;
}

/** Clear ignores transform and drawing style, but retains the active native clip coverage. */
export interface EffectRuntimeGpuClear {
  op: 'clear';
  coverage?: number;
}

export type EffectRuntimeGpuOperation = EffectRuntimeGpuDraw | EffectRuntimeGpuClear;

/** A pass is an immutable snapshot at composite time, independent of the mutable EffectV1 pass ID. */
export interface EffectRuntimeGpuPass {
  id: number;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
  operations: readonly EffectRuntimeGpuOperation[];
}

export const EFFECT_RUNTIME_GPU_PAINT_LIMITS = {
  pathCommands: 128,
  gradientStops: 128,
  bytesPerPaint: 64 * 1024,
  bytesPerPlan: 1024 * 1024,
} as const;

/** Closed native paint operands; alpha, filters and placement remain GPU draw operations. */
export interface EffectRuntimeGpuPaint {
  clips?: { rect: EffectRuntimeGpuRect; transform: EffectRuntimeGpuTransform }[];
  path: { op: string; args: (number | boolean)[]; transform: EffectRuntimeGpuTransform }[];
  draw: { op: 'fill' | 'stroke' | 'fillRect' | 'fillText'; args: (number | string)[] };
  transform: EffectRuntimeGpuTransform;
  style: {
    fill: EffectRuntimeGpuPaintColor;
    stroke: EffectRuntimeGpuPaintColor;
    font: string;
    lineWidth: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    miterLimit: number;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    direction: CanvasDirection;
  };
}
export type EffectRuntimeGpuPaintColor =
  | string
  | {
      kind: 'linear' | 'radial';
      args: number[];
      transform: EffectRuntimeGpuTransform;
      stops: [number, string][];
    };
export interface EffectRuntimeGpuPaintResource {
  coverage?: true;
  id: number;
  kind: 'paint';
  width: number;
  height: number;
  paint: EffectRuntimeGpuPaint;
}
export type EffectRuntimeGpuResource =
  | EffectRuntimeGpuRasterResource
  | EffectRuntimeGpuPaintResource;

/** Producer and both receivers admit the same bounded vocabulary before native Canvas execution. */
export function parseEffectRuntimeGpuPaint(value: unknown): EffectRuntimeGpuPaint | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'path',
      'draw',
      'transform',
      'style',
      ...(Object.hasOwn(value, 'clips') ? ['clips'] : []),
    ])
  )
    return null;
  if (
    !paintTransform(value['transform']) ||
    !paintPath(value['path']) ||
    !paintDraw(value['draw']) ||
    !paintStyle(value['style'])
  )
    return null;
  if (Object.hasOwn(value, 'clips') && !paintClips(value['clips'])) return null;
  if (JSON.stringify(value).length * 2 > EFFECT_RUNTIME_GPU_PAINT_LIMITS.bytesPerPaint) return null;
  return value as unknown as EffectRuntimeGpuPaint;
}
function finitePaintNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function paintString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}
function paintTransform(value: unknown): value is EffectRuntimeGpuTransform {
  return Array.isArray(value) && value.length === 6 && value.every(finitePaintNumber);
}
function paintClips(value: unknown) {
  if (!Array.isArray(value) || value.length > EFFECT_RUNTIME_GPU_PAINT_LIMITS.pathCommands)
    return false;
  return value.every(
    (clip) =>
      isRecord(clip) &&
      hasExactKeys(clip, ['rect', 'transform']) &&
      paintTransform(clip['transform']) &&
      isRecord(clip['rect']) &&
      hasExactKeys(clip['rect'], ['x', 'y', 'width', 'height']) &&
      Object.values(clip['rect']).every(finitePaintNumber)
  );
}
function paintPath(value: unknown) {
  if (!Array.isArray(value) || value.length > EFFECT_RUNTIME_GPU_PAINT_LIMITS.pathCommands)
    return false;
  const arities: Record<string, number> = {
    moveTo: 2,
    lineTo: 2,
    quadraticCurveTo: 4,
    bezierCurveTo: 6,
    rect: 4,
    roundRect: 5,
    arc: 6,
    arcTo: 5,
    ellipse: 8,
    closePath: 0,
  };
  return value.every(
    (item) =>
      isRecord(item) &&
      hasExactKeys(item, ['op', 'args', 'transform']) &&
      typeof item['op'] === 'string' &&
      Object.hasOwn(arities, item['op']) &&
      paintTransform(item['transform']) &&
      Array.isArray(item['args']) &&
      item['args'].length === arities[item['op']] &&
      paintPathOperands(item['op'], item['args'])
  );
}
function paintPathOperands(op: string, args: unknown[]) {
  const arc = op === 'arc' || op === 'ellipse';
  if (
    !args.every((arg, index) =>
      arc && index === args.length - 1 ? typeof arg === 'boolean' : finitePaintNumber(arg)
    )
  )
    return false;
  const values = args as number[];
  if (op === 'arc' && values[2]! < 0) return false;
  if (op === 'arcTo' && values[4]! < 0) return false;
  if (op === 'ellipse' && (values[2]! < 0 || values[3]! < 0)) return false;
  return op !== 'roundRect' || values[4]! >= 0;
}
function paintDraw(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ['op', 'args']) || !Array.isArray(value['args']))
    return false;
  const args = value['args'];
  switch (value['op']) {
    case 'fill':
      return args.length === 1 && paintChoice(args[0], ['nonzero', 'evenodd']);
    case 'stroke':
      return args.length === 0;
    case 'fillRect':
      return args.length === 4 && args.every(finitePaintNumber);
    case 'fillText':
      return (
        (args.length === 3 || args.length === 4) &&
        paintString(args[0], 16384) &&
        args.slice(1).every(finitePaintNumber)
      );
    default:
      return false;
  }
}
function paintChoice(value: unknown, choices: readonly string[]) {
  return typeof value === 'string' && choices.includes(value);
}
function paintStyle(value: unknown) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'fill',
      'stroke',
      'font',
      'lineWidth',
      'lineCap',
      'lineJoin',
      'miterLimit',
      'textAlign',
      'textBaseline',
      'direction',
    ])
  )
    return false;
  return (
    paintColor(value['fill']) &&
    paintColor(value['stroke']) &&
    paintString(value['font'], 2048) &&
    finitePaintNumber(value['lineWidth']) &&
    value['lineWidth'] > 0 &&
    finitePaintNumber(value['miterLimit']) &&
    value['miterLimit'] > 0 &&
    paintChoice(value['lineCap'], ['butt', 'round', 'square']) &&
    paintChoice(value['lineJoin'], ['round', 'bevel', 'miter']) &&
    paintChoice(value['textAlign'], ['left', 'right', 'center', 'start', 'end']) &&
    paintChoice(value['textBaseline'], [
      'top',
      'hanging',
      'middle',
      'alphabetic',
      'ideographic',
      'bottom',
    ]) &&
    paintChoice(value['direction'], ['ltr', 'rtl', 'inherit'])
  );
}
function paintColor(value: unknown): value is EffectRuntimeGpuPaintColor {
  if (paintString(value, 1024)) return true;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['kind', 'args', 'transform', 'stops']) ||
    !paintChoice(value['kind'], ['linear', 'radial']) ||
    !paintTransform(value['transform']) ||
    !Array.isArray(value['args']) ||
    value['args'].length !== (value['kind'] === 'linear' ? 4 : 6) ||
    !value['args'].every(finitePaintNumber)
  )
    return false;
  if (value['kind'] === 'radial' && (value['args'][2]! < 0 || value['args'][5]! < 0)) return false;
  return paintStops(value['stops']);
}
function paintStops(value: unknown) {
  if (!Array.isArray(value) || value.length > EFFECT_RUNTIME_GPU_PAINT_LIMITS.gradientStops)
    return false;
  return value.every(
    (stop) =>
      Array.isArray(stop) &&
      stop.length === 2 &&
      finitePaintNumber(stop[0]) &&
      stop[0] >= 0 &&
      stop[0] <= 1 &&
      paintString(stop[1], 1024)
  );
}
