import type { ReviewClickFrame } from '../../features/video/review/click-animation';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

type ReviewClickSource = {
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
};

/** Shared live/export painter; radius and stroke use source pixels, positions use source units. */
export function drawReviewClicks(
  context: CanvasRenderingContext2D,
  frames: readonly ReviewClickFrame[],
  video: QuickEditRect,
  sourceWidth: number,
  clip: { rect: QuickEditRect; radius: number },
  source?: ReviewClickSource
) {
  if (!frames.length) return;
  const scale = video.width / Math.max(1, sourceWidth);
  context.save();
  context.beginPath();
  context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
  context.clip();
  for (const frame of frames) {
    if (frame.effect === 'magnify') {
      if (source && frame.lens) drawLens(context, frame, video, scale, source);
      continue;
    }
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

/** Sample the original frame, never an already composited lens or a transparent video copy. */
function drawLens(
  context: CanvasRenderingContext2D,
  frame: ReviewClickFrame,
  video: QuickEditRect,
  pixelScale: number,
  source: ReviewClickSource
) {
  const lens = frame.lens!;
  const x = video.x + frame.point.x * video.width;
  const y = video.y + frame.point.y * video.height;
  const radius = frame.radius * pixelScale;
  if (radius <= 0 || lens.scale <= 1) return;
  context.save();
  context.globalAlpha = 1;
  context.beginPath();
  context.rect(video.x, video.y, video.width, video.height);
  context.clip();
  context.beginPath();
  if (lens.shape === 'circle') context.arc(x, y, radius, 0, Math.PI * 2);
  else context.roundRect(x - radius, y - radius, radius * 2, radius * 2, radius * 0.18);
  context.save();
  context.shadowColor = `rgba(0,0,0,${lens.shadow / 100})`;
  context.shadowBlur = radius * 0.16;
  context.shadowOffsetY = radius * 0.04;
  context.fillStyle = '#000';
  context.fill();
  context.restore();
  context.save();
  context.clip();
  source.draw(
    context,
    x + (video.x - x) * lens.scale,
    y + (video.y - y) * lens.scale,
    video.width * lens.scale,
    video.height * lens.scale
  );
  context.restore();
  context.globalAlpha = frame.opacity;
  context.strokeStyle = frame.color;
  context.lineWidth = frame.stroke * pixelScale;
  context.stroke();
  context.restore();
}
