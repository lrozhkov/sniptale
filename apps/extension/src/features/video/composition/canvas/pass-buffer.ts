import type { RenderResources } from './render-resources';
import { acquireVideoCompositionBuffer } from './buffer-pool';

interface VideoCompositionPassBuffer {
  context: CanvasRenderingContext2D;
  flush: () => void;
  /** Composite each complete sample with source-over before adding its exposure weight. */
  drawPass(alpha: number, paint: (context: CanvasRenderingContext2D) => void): void;
  dispose: () => void;
}

export function createVideoCompositionPassBuffer(params: {
  bufferHeight: number;
  bufferWidth: number;
  drawHeight: number;
  drawWidth: number;
  ownerDocument?: Document | null;
  resources?: RenderResources | undefined;
  targetContext: CanvasRenderingContext2D;
}): VideoCompositionPassBuffer | null {
  if (
    params.bufferWidth <= 0 ||
    params.bufferHeight <= 0 ||
    params.drawWidth <= 0 ||
    params.drawHeight <= 0
  ) {
    return null;
  }

  const acquire = (role: string) => {
    if (params.resources) {
      return params.resources.canvas(role, {
        width: Math.ceil(params.bufferWidth),
        height: Math.ceil(params.bufferHeight),
      });
    }
    const pooled = acquireVideoCompositionBuffer(
      params.bufferWidth,
      params.bufferHeight,
      params.ownerDocument
    );
    return pooled
      ? {
          ...pooled,
          context: pooled.canvas.getContext('2d') as CanvasRenderingContext2D | null,
        }
      : null;
  };
  const lease = acquire('motion-accumulator');
  const canvas = lease?.canvas;
  const context = lease?.context;
  if (!canvas || !context || !('setTransform' in context) || !('clearRect' in context)) {
    lease?.release();
    return null;
  }

  const drawingContext = context as CanvasRenderingContext2D;
  let saved = false;
  try {
    drawingContext.reset?.();
    drawingContext.save();
    saved = true;
    drawingContext.setTransform(1, 0, 0, 1, 0, 0);
    drawingContext.clearRect(0, 0, params.bufferWidth, params.bufferHeight);
    drawingContext.globalCompositeOperation = 'lighter';
  } catch (error) {
    try {
      if (saved) drawingContext.restore();
    } finally {
      lease!.release();
    }
    throw error;
  }

  let sampleLease: ReturnType<typeof acquire> = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      drawingContext.restore();
    } finally {
      try {
        sampleLease?.release();
      } finally {
        lease!.release();
      }
    }
  };
  return {
    dispose,
    context: drawingContext,
    drawPass: (alpha, paint) => {
      if (disposed) throw new Error('Motion blur buffer is disposed.');
      try {
        sampleLease ??= acquire('motion-sample');
        const sample = sampleLease?.canvas;
        const sampleContext = sampleLease?.context;
        if (!sample || !sampleContext) throw new Error('Motion blur sample canvas is unavailable.');
        accumulatePass(
          drawingContext,
          sample,
          sampleContext as CanvasRenderingContext2D,
          params.targetContext,
          alpha,
          paint
        );
      } catch (error) {
        dispose();
        throw error;
      }
    },
    flush: () => {
      try {
        params.targetContext.drawImage(canvas, 0, 0, params.drawWidth, params.drawHeight);
      } finally {
        dispose();
      }
    },
  };
}

/** Layer occlusion belongs to the sample; only the finished image receives the exposure weight. */
function accumulatePass(
  drawingContext: CanvasRenderingContext2D,
  sample: HTMLCanvasElement | OffscreenCanvas,
  sampleContext: CanvasRenderingContext2D,
  target: CanvasRenderingContext2D,
  alpha: number,
  paint: (context: CanvasRenderingContext2D) => void
) {
  sampleContext.save();
  try {
    sampleContext.setTransform(1, 0, 0, 1, 0, 0);
    sampleContext.clearRect(0, 0, sample.width, sample.height);
    sampleContext.globalCompositeOperation = 'source-over';
    sampleContext.globalAlpha = 1;
    sampleContext.imageSmoothingEnabled = target.imageSmoothingEnabled;
    sampleContext.imageSmoothingQuality = target.imageSmoothingQuality;
    const transform = drawingContext.getTransform?.();
    if (transform) sampleContext.setTransform(transform);
    paint(sampleContext);
  } finally {
    sampleContext.restore();
  }
  drawingContext.save();
  try {
    drawingContext.setTransform(1, 0, 0, 1, 0, 0);
    drawingContext.globalCompositeOperation = 'lighter';
    drawingContext.globalAlpha = alpha;
    drawingContext.drawImage(sample, 0, 0);
  } finally {
    drawingContext.restore();
  }
}
