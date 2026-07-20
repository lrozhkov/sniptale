import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import type { BlurRuntimeObject } from '../types';
import { clipBlurArea, resolveBlurRenderArea } from './area';
import { renderBlurFill } from './fill';
import { renderBlurFrame } from './frame';

export function attachBlurRenderer(
  object: BlurRuntimeObject,
  getSettings: (object: BlurRuntimeObject) => BlurSettings
): void {
  if (object.sniptaleBlurRenderAttached) {
    return;
  }

  object.sniptaleBlurBaseRender = object._render.bind(object);
  object._render = function renderBlurObject(ctx: CanvasRenderingContext2D) {
    const target = this as BlurRuntimeObject;
    const settings = getSettings(target);
    ctx.save();
    clipBlurArea(ctx, resolveBlurRenderArea(target, settings));
    renderBlurFill(target, ctx, settings);
    ctx.restore();
    renderBlurFrame(target, ctx, settings);
    this.sniptaleBlurBaseRender?.(ctx);
  };
  object.sniptaleBlurRenderAttached = true;
}
