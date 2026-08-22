import { VideoSample } from 'mediabunny';
import type { LiveVideoSampleTiming } from './live-video-timeline';

export type LiveVideoFrameTransform = Readonly<{
  fit: 'contain' | 'cover' | 'fill';
  outputSize: Readonly<{ height: number; width: number }>;
  sourceRect: Readonly<{ height: number; width: number; x: number; y: number }>;
}>;

/** Owns the single reusable encoder-adjacent raster transform for non-SOURCE profiles. */
type VideoFrameColorSpaceInit = VideoFrameInit & { colorSpace?: VideoColorSpaceInit };

export class LiveVideoFrameTransformer {
  private canvas: OffscreenCanvas | null = null;
  private context: OffscreenCanvasRenderingContext2D | null = null;

  constructor(private readonly transform: LiveVideoFrameTransform) {}

  transformFrame(
    frame: VideoFrame,
    timing: LiveVideoSampleTiming,
    colorSpace?: VideoColorSpaceInit
  ): VideoSample {
    if (canUseVisibleRectTransform(this.transform)) {
      return createVisibleRectSample(frame, this.transform.sourceRect, timing, colorSpace);
    }
    const context = this.getRasterContext();
    const { fit, outputSize, sourceRect } = this.transform;
    const destination = resolveDestinationRect(sourceRect, outputSize, fit);
    if (destination.hasBars) {
      context.fillStyle = 'black';
      context.fillRect(0, 0, outputSize.width, outputSize.height);
    }
    context.drawImage(
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
    return new VideoSample(this.canvas!, {
      ...(colorSpace ? { colorSpace } : {}),
      duration: timing.duration,
      timestamp: timing.timestamp,
    });
  }

  private getRasterContext(): OffscreenCanvasRenderingContext2D {
    if (this.context) return this.context;
    const { outputSize } = this.transform;
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('Live video transforms require OffscreenCanvas.');
    }
    this.canvas = new OffscreenCanvas(outputSize.width, outputSize.height);
    const context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    if (!context) throw new Error('Live video transforms require a 2D OffscreenCanvas context.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    this.context = context;
    return context;
  }
}

function canUseVisibleRectTransform({
  fit,
  outputSize,
  sourceRect,
}: LiveVideoFrameTransform): boolean {
  return (
    fit === 'fill' &&
    outputSize.width === sourceRect.width &&
    outputSize.height === sourceRect.height &&
    [sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height].every(
      (value) => value % 2 === 0
    )
  );
}

function createVisibleRectSample(
  frame: VideoFrame,
  sourceRect: LiveVideoFrameTransform['sourceRect'],
  timing: LiveVideoSampleTiming,
  colorSpace?: VideoColorSpaceInit
): VideoSample {
  const duration = Math.trunc(timing.duration * 1_000_000);
  const frameInit: VideoFrameColorSpaceInit = {
    ...(colorSpace ? { colorSpace } : {}),
    timestamp: Math.trunc(timing.timestamp * 1_000_000),
    visibleRect: {
      height: sourceRect.height,
      width: sourceRect.width,
      x: sourceRect.x,
      y: sourceRect.y,
    },
    ...(duration ? { duration } : {}),
  };
  return new VideoSample(new VideoFrame(frame, frameInit as VideoFrameInit));
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
