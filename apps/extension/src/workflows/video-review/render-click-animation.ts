import type { ReviewClickFrame } from '../../features/video/review/click-animation';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import {
  drawPointerFeedbackFrame,
  type PointerFeedbackSource,
} from '../../features/video/composition/draw/pointer-feedback';

/** Project source coordinates and source pixel sizes into the fitted Gallery window. */
export function drawReviewClicks(
  context: CanvasRenderingContext2D,
  frames: readonly ReviewClickFrame[],
  video: QuickEditRect,
  sourceWidth: number,
  clip: { rect: QuickEditRect; radius: number; contentRect?: QuickEditRect },
  source?: PointerFeedbackSource,
  sharpPaint?: (index: number) => ((context: CanvasRenderingContext2D) => void) | undefined
) {
  if (!frames.length) return;
  const scale = video.width / Math.max(1, sourceWidth);
  context.save();
  try {
    for (const [index, frame] of frames.entries()) {
      context.save();
      try {
        if (frame.effect !== 'magnify') {
          context.beginPath();
          context.roundRect(
            clip.rect.x,
            clip.rect.y,
            clip.rect.width,
            clip.rect.height,
            clip.radius
          );
          context.clip();
          if (clip.contentRect) {
            const content = clip.contentRect;
            context.beginPath();
            context.rect(content.x, content.y, content.width, content.height);
            context.clip();
          }
        }
        const preparedSharp = sharpPaint?.(index);
        context.globalAlpha = 1;
        drawPointerFeedbackFrame(
          context,
          {
            ...frame,
            point: {
              x: video.x + frame.point.x * video.width,
              y: video.y + frame.point.y * video.height,
            },
            radius: frame.radius * scale,
            stroke: frame.stroke * scale,
            ...(frame.path
              ? {
                  path: frame.path.map((point) => ({
                    x: video.x + point.x * video.width,
                    y: video.y + point.y * video.height,
                  })),
                }
              : {}),
            ...(frame.area
              ? {
                  area: {
                    x: video.x + frame.area.x * video.width,
                    y: video.y + frame.area.y * video.height,
                    width: frame.area.width * video.width,
                    height: frame.area.height * video.height,
                  },
                }
              : {}),
          },
          source && preparedSharp ? { ...source, sharpPaint: preparedSharp } : source
        );
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
  }
}
