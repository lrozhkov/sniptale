import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import type { BlurRuntimeObject } from '../types';
import type { BlurRenderArea } from './types';

export function resolveBlurRenderArea(
  object: BlurRuntimeObject,
  settings: BlurSettings
): BlurRenderArea {
  const width = Math.max(1, Math.round(object.width ?? 1));
  const height = Math.max(1, Math.round(object.height ?? 1));

  return {
    height,
    radius: Math.min(Math.max(0, settings.radius ?? 0), width / 2, height / 2),
    width,
  };
}

export function clipBlurArea(ctx: CanvasRenderingContext2D, area: BlurRenderArea): void {
  const left = -area.width / 2;
  const top = -area.height / 2;
  const right = area.width / 2;
  const bottom = area.height / 2;
  const radius = area.radius;

  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(left, top, area.width, area.height);
  } else {
    ctx.moveTo(left + radius, top);
    ctx.lineTo(right - radius, top);
    ctx.quadraticCurveTo(right, top, right, top + radius);
    ctx.lineTo(right, bottom - radius);
    ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
    ctx.lineTo(left + radius, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
    ctx.lineTo(left, top + radius);
    ctx.quadraticCurveTo(left, top, left + radius, top);
  }
  ctx.clip();
}
