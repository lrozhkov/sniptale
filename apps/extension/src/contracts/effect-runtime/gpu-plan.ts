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
export interface EffectRuntimeGpuResource {
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
