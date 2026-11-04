import {
  createEffectRuntimeDrawState,
  drawTransitionOverlay,
  hasEffectRuntimeTransitionFrame,
  type EffectRuntimeDrawState,
} from '../../../features/video/composition/draw';
import { createVideoCompositionPassBuffer } from '../../../features/video/composition/canvas/pass-buffer';
import {
  getEffectRuntimeVisualPassFrames,
  type EffectRuntimeRenderedComposition,
} from '../../../features/video/composition/effect-runtime';
import type { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import type { QuickEditHomography } from '../../../features/video/composition/motion/spatial-geometry';
import type { VideoProjectExportSettings } from '../../../features/video/project/types';

type VisualPasses = ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];

export function resolveExportEffectDrawState(
  states: Map<number, EffectRuntimeDrawState>,
  time: number
): EffectRuntimeDrawState {
  const existing = states.get(time);
  if (existing) return existing;
  const created = createEffectRuntimeDrawState();
  states.set(time, created);
  return created;
}

export async function drawExportTransitionOverlayPasses(
  context: CanvasRenderingContext2D,
  passes: VisualPasses,
  settings: VideoProjectExportSettings,
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined,
  sharpTarget?: {
    size: { width: number; height: number };
    transform: QuickEditHomography;
    reserveRaster(width: number, height: number): () => void;
  }
): Promise<void> {
  if (sharpTarget && !passes.some((pass) => pass.transitionOverlays?.length)) return;
  const ownerDocument =
    typeof HTMLCanvasElement !== 'undefined' && context.canvas instanceof HTMLCanvasElement
      ? context.canvas.ownerDocument
      : null;
  const targetSize = sharpTarget?.size ?? settings;
  const releases: (() => void)[] = [];
  let passBuffer: ReturnType<typeof createVideoCompositionPassBuffer> = null;
  try {
    if (sharpTarget && passes.length > 1) {
      releases.push(sharpTarget.reserveRaster(targetSize.width, targetSize.height));
      releases.push(sharpTarget.reserveRaster(targetSize.width, targetSize.height));
    }
    passBuffer =
      passes.length > 1
        ? createVideoCompositionPassBuffer({
            bufferHeight: targetSize.height,
            bufferWidth: targetSize.width,
            drawHeight: targetSize.height,
            drawWidth: targetSize.width,
            ownerDocument,
            targetContext: context,
          })
        : null;
    const drawContext = passBuffer?.context ?? context;
    if (sharpTarget && passes.length > 1 && !passBuffer)
      throw new Error('Sharp transition buffer is unavailable.');
    if (sharpTarget && passBuffer) {
      const m = sharpTarget.transform;
      drawContext.setTransform(m[0], m[3], m[1], m[4], m[2], m[5]);
    }
    for (const pass of passes) {
      if (!pass.transitionOverlays?.length) continue;
      await effectRuntimeFrames?.prepareVisualPass?.(pass.time);
      const paint = (target: CanvasRenderingContext2D) => {
        for (const overlay of pass.transitionOverlays ?? []) {
          const frames = getEffectRuntimeVisualPassFrames(effectRuntimeFrames, pass.time);
          if (hasEffectRuntimeTransitionFrame(frames, overlay.transitionId)) continue;
          drawTransitionOverlay(
            target,
            overlay,
            settings.width,
            settings.height,
            passBuffer && sharpTarget ? 1 : pass.alpha
          );
        }
      };
      if (sharpTarget && passBuffer) passBuffer.drawPass(pass.alpha, paint);
      else paint(drawContext);
    }
    passBuffer?.flush();
  } finally {
    passBuffer?.dispose();
    for (const release of releases) release();
  }
}
