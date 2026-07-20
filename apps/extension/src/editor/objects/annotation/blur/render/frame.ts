import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import { traceCanvasRoundedRect } from '../../../canvas-rounded-rect';
import { applyCanvasShadow } from '../../../shadow';
import { getBlurFrameStyle } from '../border';
import type { BlurRuntimeObject } from '../types';

export function renderBlurFrame(
  object: BlurRuntimeObject,
  ctx: CanvasRenderingContext2D,
  settings: BlurSettings
): void {
  const frame = getBlurFrameStyle(settings);
  if (!frame.visible) {
    return;
  }

  const width = Math.max(1, Math.round(object.width ?? 1));
  const height = Math.max(1, Math.round(object.height ?? 1));
  const strokeInset = frame.strokeWidth / 2;

  ctx.save();
  applyCanvasShadow(ctx, frame.shadow, frame.strokeColor);
  ctx.strokeStyle = frame.stroke;
  ctx.lineWidth = frame.strokeWidth;
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash(frame.strokeDashArray ?? []);
  }
  traceCanvasRoundedRect(ctx, {
    height: height + frame.strokeWidth,
    left: -width / 2 - strokeInset,
    radius: frame.radius + strokeInset,
    top: -height / 2 - strokeInset,
    width: width + frame.strokeWidth,
  });
  ctx.stroke();
  ctx.restore();
}
