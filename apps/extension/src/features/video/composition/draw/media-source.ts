export interface VideoCompositionFrameSource {
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
    'sourceHeight' in source &&
    hasFiniteDimension(source.sourceHeight) &&
    'sourceWidth' in source &&
    hasFiniteDimension(source.sourceWidth)
  );
}
