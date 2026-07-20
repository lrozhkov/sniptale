export interface VideoCompositionFrameSource {
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

export function isVideoCompositionFrameSource(
  source: unknown
): source is VideoCompositionFrameSource {
  return (
    typeof source === 'object' &&
    source !== null &&
    'draw' in source &&
    typeof source.draw === 'function' &&
    'sourceHeight' in source &&
    hasFiniteDimension(source.sourceHeight) &&
    'sourceWidth' in source &&
    hasFiniteDimension(source.sourceWidth)
  );
}
