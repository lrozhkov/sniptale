import type { AnnotationSweepProfile } from '../../../project/annotation/sweep-profile';

function clampVisualProgress(progress: number) {
  return Math.min(1, Math.max(0, progress));
}

export function runWithMotionState(
  context: CanvasRenderingContext2D,
  progress: number,
  anchorX: number,
  anchorY: number,
  options: { scaleFrom?: number; translateX?: number; translateY?: number } = {},
  render: () => void
) {
  const normalizedProgress = clampVisualProgress(progress);
  if (normalizedProgress <= 0) {
    return;
  }

  const translateX = (1 - normalizedProgress) * (options.translateX ?? 0);
  const translateY = (1 - normalizedProgress) * (options.translateY ?? 12);
  const scaleFrom = options.scaleFrom ?? 0.96;
  const scale = scaleFrom + normalizedProgress * (1 - scaleFrom);

  context.save();
  context.globalAlpha =
    (typeof context.globalAlpha === 'number' ? context.globalAlpha : 1) * normalizedProgress;
  context.translate(anchorX + translateX, anchorY + translateY);
  context.scale(scale, scale);
  context.translate(-anchorX, -anchorY);
  render();
  context.restore();
}

export function drawSweepOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  x: number,
  y: number,
  progress: number,
  alpha: number,
  profile: AnnotationSweepProfile
) {
  const sweepWidth = Math.max(20, width * (profile.widthPercent / 100));
  const sweepTravel = width + sweepWidth * (profile.travelPercent / 100);
  const sweepX = x + sweepTravel * progress - sweepWidth;
  const gradient = context.createLinearGradient(
    sweepX,
    y + height * profile.startYOffset,
    sweepX + sweepWidth,
    y + height * (1 - profile.startYOffset)
  );
  gradient.addColorStop(0, `rgba(${profile.tintRgb},0)`);
  gradient.addColorStop(0.2, `rgba(${profile.tintRgb},${(profile.edgeAlpha * alpha).toFixed(2)})`);
  gradient.addColorStop(0.5, `rgba(${profile.tintRgb},${(profile.peakAlpha * alpha).toFixed(2)})`);
  gradient.addColorStop(0.8, `rgba(${profile.tintRgb},${(profile.edgeAlpha * alpha).toFixed(2)})`);
  gradient.addColorStop(1, `rgba(${profile.tintRgb},0)`);
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
}

export function withRevealClip(
  context: CanvasRenderingContext2D,
  progress: number,
  x: number,
  y: number,
  width: number,
  height: number,
  render: () => void
) {
  const resolvedProgress = Math.min(1, Math.max(0, progress));
  if (resolvedProgress <= 0) {
    return;
  }

  const revealHeight = height * resolvedProgress;

  context.save();
  context.beginPath();
  context.rect(x, y + (height - revealHeight), width, revealHeight);
  context.clip();
  render();
  context.restore();
}
