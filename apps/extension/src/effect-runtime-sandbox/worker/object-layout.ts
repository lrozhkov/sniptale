import {
  resolveEffectV1ObjectRenderBounds,
  type EffectV1ObjectLayout,
} from '@sniptale/runtime-contracts/effect-v1';
import type { EffectRuntimeGraphFrameContext, RuntimeCanvasContext } from './model/types';

/** Keeps graph coordinates attached to the body while rasterizing the full render rectangle. */
export function applyEffectObjectLayout(
  layout: EffectV1ObjectLayout | undefined,
  context: EffectRuntimeGraphFrameContext,
  canvas: RuntimeCanvasContext
): EffectRuntimeGraphFrameContext {
  if (!layout) return context;
  const scaled = layout.resize === 'scale';
  const bounds = scaled
    ? resolveEffectV1ObjectRenderBounds(layout, context.controls)
    : { x: 0, y: 0, width: context.width, height: context.height };
  const scale = scaled ? Math.min(context.width / bounds.width, context.height / bounds.height) : 1;
  canvas.translate(
    (context.width - bounds.width * scale) / 2 - bounds.x * scale,
    (context.height - bounds.height * scale) / 2 - bounds.y * scale
  );
  canvas.scale(scale, scale);
  canvas.beginPath();
  canvas.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  canvas.clip();
  return scaled ? { ...context, width: layout.width, height: layout.height } : context;
}
