import { VideoSample } from 'mediabunny';
import type { LiveVideoSampleTiming } from './live-video-timeline';

export type LiveVideoFrameTransform = Readonly<{
  fit: 'contain' | 'cover' | 'fill';
  outputSize: Readonly<{ height: number; width: number }>;
  sourceRect: Readonly<{ height: number; width: number; x: number; y: number }>;
}>;

/** Owns the single reusable encoder-adjacent raster transform for non-SOURCE profiles. */
export class LiveVideoFrameTransformer {
  private readonly canvas: OffscreenCanvas;
  private readonly context: OffscreenCanvasRenderingContext2D;

  constructor(private readonly transform: LiveVideoFrameTransform) {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('Live video transforms require OffscreenCanvas.');
    }
    this.canvas = new OffscreenCanvas(transform.outputSize.width, transform.outputSize.height);
    const context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    if (!context) throw new Error('Live video transforms require a 2D OffscreenCanvas context.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    this.context = context;
  }

  transformFrame(frame: VideoFrame, timing: LiveVideoSampleTiming): VideoSample {
    const { fit, outputSize, sourceRect } = this.transform;
    const destination = resolveDestinationRect(sourceRect, outputSize, fit);
    if (destination.hasBars) {
      this.context.fillStyle = 'black';
      this.context.fillRect(0, 0, outputSize.width, outputSize.height);
    }
    this.context.drawImage(
      frame,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      destination.x,
      destination.y,
      destination.width,
      destination.height
    );
    return new VideoSample(this.canvas, {
      duration: timing.duration,
      timestamp: timing.timestamp,
    });
  }
}

function resolveDestinationRect(
  source: Readonly<{ height: number; width: number }>,
  output: Readonly<{ height: number; width: number }>,
  fit: LiveVideoFrameTransform['fit']
): { hasBars: boolean; height: number; width: number; x: number; y: number } {
  if (fit === 'fill') {
    return { hasBars: false, height: output.height, width: output.width, x: 0, y: 0 };
  }
  const scale =
    fit === 'contain'
      ? Math.min(output.width / source.width, output.height / source.height)
      : Math.max(output.width / source.width, output.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    hasBars: fit === 'contain' && (width < output.width || height < output.height),
    height,
    width,
    x: (output.width - width) / 2,
    y: (output.height - height) / 2,
  };
}
