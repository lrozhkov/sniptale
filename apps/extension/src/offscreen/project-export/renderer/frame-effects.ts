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

export function drawExportTransitionOverlayPasses(
  context: CanvasRenderingContext2D,
  passes: VisualPasses,
  settings: VideoProjectExportSettings,
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined
): void {
  const ownerDocument =
    typeof HTMLCanvasElement !== 'undefined' && context.canvas instanceof HTMLCanvasElement
      ? context.canvas.ownerDocument
      : null;
  const passBuffer =
    passes.length > 1
      ? createVideoCompositionPassBuffer({
          bufferHeight: settings.height,
          bufferWidth: settings.width,
          drawHeight: settings.height,
          drawWidth: settings.width,
          ownerDocument,
          targetContext: context,
        })
      : null;
  const drawContext = passBuffer?.context ?? context;
  for (const pass of passes) {
    for (const overlay of pass.transitionOverlays ?? []) {
      const frames = getEffectRuntimeVisualPassFrames(effectRuntimeFrames, pass.time);
      if (hasEffectRuntimeTransitionFrame(frames, overlay.transitionId)) continue;
      drawTransitionOverlay(drawContext, overlay, settings.width, settings.height, pass.alpha);
    }
  }
  passBuffer?.flush();
}
