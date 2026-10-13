import { resolveQuickEditShadow } from '../../features/video/review/advanced/shadow';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

/** Shadow storage stays in original scene coordinates, independently of camera projection. */
export function reviewSpatialSourceRect(args: {
  output: { width: number; height: number };
  window: QuickEditRect;
  background: QuickEditBackgroundSettings;
  sceneScale?: number;
}): QuickEditRect {
  const shadow = resolveQuickEditShadow(args.background, args.sceneScale ?? 1);
  if (!shadow) return { x: 0, y: 0, width: args.output.width, height: args.output.height };
  const margin = Math.max(1, shadow.blur * 4);
  const x = Math.floor(Math.min(0, args.window.x - margin)) - 2;
  const y = Math.floor(Math.min(0, args.window.y - margin)) - 2;
  const right =
    Math.ceil(Math.max(args.output.width, args.window.x + args.window.width + margin)) + 2;
  const bottom =
    Math.ceil(Math.max(args.output.height, args.window.y + args.window.height + margin)) + 2;
  return { x, y, width: right - x, height: bottom - y };
}

/** Clip out the entire window so the caster never becomes a backing plate. */
export function drawReviewSceneShadow(
  context: CanvasRenderingContext2D,
  background: QuickEditBackgroundSettings,
  window: QuickEditRect,
  radius: number,
  scale = 1
) {
  const shadow = resolveQuickEditShadow(background, scale);
  if (!shadow) return;
  const margin = Math.max(1, shadow.blur * 4);
  const corner = Math.min(radius, window.width / 2, window.height / 2);
  context.save();
  context.beginPath();
  context.rect(
    window.x - margin,
    window.y - margin,
    window.width + margin * 2,
    window.height + margin * 2
  );
  context.roundRect(window.x, window.y, window.width, window.height, corner);
  context.clip('evenodd');
  context.shadowColor = shadow.color;
  context.shadowBlur = shadow.blur;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.globalAlpha *= shadow.opacity;
  context.fillStyle = '#000000';
  context.beginPath();
  context.roundRect(window.x, window.y, window.width, window.height, corner);
  context.fill();
  context.restore();
}
