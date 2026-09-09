import { acquireVideoCompositionBuffer } from './buffer-pool';

interface VideoCompositionPassBuffer {
  context: CanvasRenderingContext2D;
  flush: () => void;
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

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    drawingContext.restore();
    lease!.release();
  };
  return {
    dispose,
    context: drawingContext,
    flush: () => {
      try {
        params.targetContext.drawImage(canvas, 0, 0, params.drawWidth, params.drawHeight);
      } finally {
        dispose();
      }
    },
  };
}
