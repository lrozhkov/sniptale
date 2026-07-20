import { VideoTemplateDirection } from '../../project/types/index';
import type { ResolvedTransitionOverlay } from '../../project/transition/presentation';

function getSweepProgress(direction: VideoTemplateDirection, progress: number): number {
  switch (direction) {
    case VideoTemplateDirection.LEFT:
    case VideoTemplateDirection.UP:
      return 1 - progress;
    case VideoTemplateDirection.RIGHT:
    case VideoTemplateDirection.DOWN:
      return progress;
  }
}

function drawFillOverlay(
  context: CanvasRenderingContext2D,
  overlay: ResolvedTransitionOverlay,
  width: number,
  height: number,
  opacityMultiplier: number
) {
  context.save();
  context.globalAlpha = overlay.alpha * opacityMultiplier;
  context.fillStyle = overlay.color;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function drawSweepOverlay(
  context: CanvasRenderingContext2D,
  overlay: ResolvedTransitionOverlay,
  width: number,
  height: number,
  opacityMultiplier: number
) {
  const progress = getSweepProgress(overlay.direction, overlay.progress);
  const horizontal =
    overlay.direction === VideoTemplateDirection.LEFT ||
    overlay.direction === VideoTemplateDirection.RIGHT;
  const size = horizontal ? width : height;
  const center = progress * size;
  const bandWidth = Math.max(size * overlay.width, 1);
  const innerWidth = Math.max(bandWidth * (1 - overlay.softness), 1);
  const gradient = horizontal
    ? context.createLinearGradient(center - bandWidth, 0, center + bandWidth, 0)
    : context.createLinearGradient(0, center - bandWidth, 0, center + bandWidth);

  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(
    clampNumber((bandWidth - innerWidth) / (bandWidth * 2), 0, 1),
    'rgba(255, 255, 255, 0)'
  );
  gradient.addColorStop(0.5, overlay.color);
  gradient.addColorStop(
    clampNumber((bandWidth + innerWidth) / (bandWidth * 2), 0, 1),
    'rgba(255, 255, 255, 0)'
  );
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  context.save();
  context.globalAlpha = overlay.alpha * opacityMultiplier;
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function drawTransitionOverlay(
  context: CanvasRenderingContext2D,
  overlay: ResolvedTransitionOverlay,
  width: number,
  height: number,
  opacityMultiplier = 1
) {
  switch (overlay.kind) {
    case 'fill':
      drawFillOverlay(context, overlay, width, height, opacityMultiplier);
      return;
    case 'sweep':
      drawSweepOverlay(context, overlay, width, height, opacityMultiplier);
  }
}
