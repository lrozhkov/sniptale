import { resolveMediaFitFrame } from '../../features/video/project/window-geometry';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';

type Size = { width: number; height: number };
type Framing = Pick<
  NonNullable<QuickEditPresentationSettings['intro']['image']>,
  'fit' | 'fillColor' | 'crop'
>;

/** Paints one admitted bookend without inheriting the main scene's decoration or transform. */
export function drawReviewPresentationFrame(
  context: CanvasRenderingContext2D,
  source: Size,
  output: Size,
  framing: Framing,
  draw: (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ) => void
) {
  if (
    ![source.width, source.height, output.width, output.height].every(
      (n) => Number.isFinite(n) && n > 0
    )
  )
    throw new Error('Invalid presentation dimensions');
  const frame = resolveMediaFitFrame({ source, output, fit: framing.fit, crop: framing.crop });
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.beginPath();
    context.rect(0, 0, output.width, output.height);
    context.clip();
    context.fillStyle = framing.fillColor;
    context.fillRect(0, 0, output.width, output.height);
    draw(context, frame.x, frame.y, frame.width, frame.height);
  } finally {
    context.restore();
  }
}
