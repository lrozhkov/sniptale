import type { RenderResources } from '../canvas/render-resources';
import type { QuickEditHomography } from '../motion/spatial-geometry';

export interface SourceSamplingRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface SourceSamplingIdentity {
  readonly sourceKey: object;
  readonly sourceTime: number;
  readonly passTime: number;
  readonly sourceSize: { readonly width: number; readonly height: number };
}
export interface SourceSamplingDemand extends SourceSamplingIdentity {
  readonly id: string;
  readonly originalPixelROI: SourceSamplingRect;
  readonly sourceToOutputHomography: QuickEditHomography;
  readonly targetRasterSize: { readonly width: number; readonly height: number };
  readonly lensScale?: number;
}
export interface PreparedSourceTile {
  readonly image: HTMLCanvasElement;
  readonly physicalSourceRect: SourceSamplingRect;
  readonly originalPixelROI: SourceSamplingRect;
}
/** A pass owns tile storage. Draw consumers borrow it synchronously, before the pass is disposed. */
export interface PreparedSourceSampling extends SourceSamplingIdentity {
  drawPrepared(
    demandId: string,
    context: CanvasRenderingContext2D,
    originalSourceROI: SourceSamplingRect,
    destination: SourceSamplingRect
  ): boolean;
  visitPreparedTiles(demandId: string, consume: (tile: PreparedSourceTile) => void): boolean;
}

export interface VideoCompositionFrameSource {
  readonly renderResources?: RenderResources;
  readonly preparedSampling?: PreparedSourceSampling;
  readonly orientation?: { rotation: 0 | 90 | 180 | 270; flip: boolean };
  /** Returns an owned frame clone; the GPU consumer closes it after submission completes. */
  toVideoFrame?(): VideoFrame;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  draw(
    context: CanvasRenderingContext2D,
    drawX: number,
    drawY: number,
    drawWidth: number,
    drawHeight: number
  ): void;
}

export type VideoCompositionMediaSource = HTMLMediaElement | VideoCompositionFrameSource;

function hasFiniteDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasPreparedSampling(value: unknown, width: number, height: number): boolean {
  return (
    value === undefined ||
    (typeof value === 'object' &&
      value !== null &&
      'sourceKey' in value &&
      typeof value.sourceKey === 'object' &&
      value.sourceKey !== null &&
      'sourceTime' in value &&
      typeof value.sourceTime === 'number' &&
      Number.isFinite(value.sourceTime) &&
      'passTime' in value &&
      typeof value.passTime === 'number' &&
      Number.isFinite(value.passTime) &&
      'sourceSize' in value &&
      typeof value.sourceSize === 'object' &&
      value.sourceSize !== null &&
      'width' in value.sourceSize &&
      hasFiniteDimension(value.sourceSize.width) &&
      'height' in value.sourceSize &&
      hasFiniteDimension(value.sourceSize.height) &&
      value.sourceSize.width === width &&
      value.sourceSize.height === height &&
      'drawPrepared' in value &&
      typeof value.drawPrepared === 'function' &&
      'visitPreparedTiles' in value &&
      typeof value.visitPreparedTiles === 'function')
  );
}

function hasRenderResources(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'object' &&
      value !== null &&
      'canvas' in value &&
      typeof value.canvas === 'function' &&
      'bytes' in value &&
      typeof value.bytes === 'function')
  );
}

function hasFrameOrientation(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'object' &&
      value !== null &&
      'rotation' in value &&
      (value.rotation === 0 ||
        value.rotation === 90 ||
        value.rotation === 180 ||
        value.rotation === 270) &&
      'flip' in value &&
      typeof value.flip === 'boolean')
  );
}

export function isVideoCompositionFrameSource(
  source: unknown
): source is VideoCompositionFrameSource {
  return (
    typeof source === 'object' &&
    source !== null &&
    'draw' in source &&
    typeof source.draw === 'function' &&
    (!('toVideoFrame' in source) ||
      source.toVideoFrame === undefined ||
      typeof source.toVideoFrame === 'function') &&
    (!('orientation' in source) || hasFrameOrientation(source.orientation)) &&
    (!('renderResources' in source) || hasRenderResources(source.renderResources)) &&
    'sourceHeight' in source &&
    hasFiniteDimension(source.sourceHeight) &&
    'sourceWidth' in source &&
    hasFiniteDimension(source.sourceWidth) &&
    (!('preparedSampling' in source) ||
      hasPreparedSampling(source.preparedSampling, source.sourceWidth, source.sourceHeight))
  );
}
