import { createVideoCompositionPassBuffer } from '../../../../features/video/composition/canvas/pass-buffer';
import type { PreparedPreviewSceneCanvas } from './canvas';

export function resolvePreviewPassTarget(params: {
  canvas: HTMLCanvasElement;
  passCount: number;
  prepared: PreparedPreviewSceneCanvas;
}) {
  if (params.passCount <= 1) {
    return { context: params.prepared.context, flush: () => undefined };
  }
  const buffer = createVideoCompositionPassBuffer({
    bufferHeight: params.canvas.height,
    bufferWidth: params.canvas.width,
    drawHeight: params.prepared.bounds.height,
    drawWidth: params.prepared.bounds.width,
    ownerDocument: params.canvas.ownerDocument,
    targetContext: params.prepared.context,
  });
  if (!buffer) return { context: params.prepared.context, flush: () => undefined };
  buffer.context.setTransform(params.prepared.dpr, 0, 0, params.prepared.dpr, 0, 0);
  return buffer;
}
