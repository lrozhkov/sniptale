import type { ReviewClickFrame } from '../../features/video/review/click-animation';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

/** Shared live/export painter; radius and stroke use source pixels, positions use source units. */
export function drawReviewClicks(
  context: CanvasRenderingContext2D,
  frames: readonly ReviewClickFrame[],
  video: QuickEditRect,
  sourceWidth: number,
  clip: { rect: QuickEditRect; radius: number }
) {
  if (!frames.length) return;
  const scale = video.width / Math.max(1, sourceWidth);
  context.save();
  context.beginPath();
  context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
  context.clip();
  for (const frame of frames) {
    const x = video.x + frame.point.x * video.width;
    const y = video.y + frame.point.y * video.height;
    const radius = Math.max(0.01, frame.radius * scale);
    context.globalAlpha = frame.opacity;
    context.strokeStyle = frame.color;
    context.fillStyle = frame.color;
    context.lineWidth = frame.stroke * scale;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    if (frame.effect === 'ripple') context.stroke();
    else {
      if (frame.effect === 'glow') {
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, frame.color);
        gradient.addColorStop(1, 'transparent');
        context.fillStyle = gradient;
      }
      context.fill();
    }
  }
  context.restore();
}
