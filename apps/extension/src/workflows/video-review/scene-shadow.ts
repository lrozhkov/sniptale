import { resolveQuickEditShadow } from '../../features/video/review/advanced/shadow';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

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
