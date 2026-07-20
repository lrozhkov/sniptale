import {
  createEffectRuntimeDrawState,
  drawTransitionOverlay,
  hasEffectRuntimeTransitionFrame,
  type EffectRuntimeDrawState,
} from '../../../../features/video/composition/draw';
import {
  getEffectRuntimeVisualPassFrames,
  type EffectRuntimeRenderedComposition,
} from '../../../../features/video/composition/effect-runtime';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { PreparedPreviewSceneCanvas } from './canvas';
import { resolvePreviewPassTarget } from './render-pass-target';

type VisualPasses = ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];

export function resolvePreviewEffectDrawState(
  states: Map<number, EffectRuntimeDrawState>,
  time: number
): EffectRuntimeDrawState {
  const existing = states.get(time);
  if (existing) return existing;
  const created = createEffectRuntimeDrawState();
  states.set(time, created);
  return created;
}

export function drawPreviewTransitionOverlays(params: {
  canvas: HTMLCanvasElement;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  passes: VisualPasses;
  prepared: PreparedPreviewSceneCanvas;
}): void {
  const passTarget = resolvePreviewPassTarget({
    canvas: params.canvas,
    passCount: params.passes.length,
    prepared: params.prepared,
  });
  for (const pass of params.passes) {
    for (const overlay of pass.transitionOverlays ?? []) {
      const frames = getEffectRuntimeVisualPassFrames(params.effectRuntimeFrames, pass.time);
      if (hasEffectRuntimeTransitionFrame(frames, overlay.transitionId)) continue;
      drawTransitionOverlay(
        passTarget.context,
        overlay,
        params.prepared.bounds.width,
        params.prepared.bounds.height,
        pass.alpha
      );
    }
  }
  passTarget.flush();
}
