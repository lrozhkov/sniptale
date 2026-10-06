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

  const lease = acquireVideoCompositionBuffer(
    params.bufferWidth,
    params.bufferHeight,
    params.ownerDocument
  );
  const canvas = lease?.canvas;
  const context = canvas?.getContext('2d') ?? null;
  if (!canvas || !context || !('setTransform' in context) || !('clearRect' in context)) {
    lease?.release();
    return null;
  }

  const drawingContext = context as CanvasRenderingContext2D;
  drawingContext.reset?.();
  drawingContext.save();
  drawingContext.setTransform(1, 0, 0, 1, 0, 0);
  drawingContext.clearRect(0, 0, params.bufferWidth, params.bufferHeight);
  drawingContext.globalCompositeOperation = 'lighter';

  let sampleLease: ReturnType<typeof acquireVideoCompositionBuffer> = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    drawingContext.restore();
    sampleLease?.release();
    lease!.release();
  };
  return {
    dispose,
    context: drawingContext,
    drawPass: (alpha, paint) => {
      sampleLease ??= acquireVideoCompositionBuffer(
        params.bufferWidth,
        params.bufferHeight,
        params.ownerDocument
      );
      const sample = sampleLease?.canvas;
      const sampleContext = sample?.getContext('2d');
      if (!sample || !sampleContext) throw new Error('Motion blur sample canvas is unavailable.');
      accumulatePass(
        drawingContext,
        sample,
        sampleContext as CanvasRenderingContext2D,
        params.targetContext,
        alpha,
        paint
      );
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
