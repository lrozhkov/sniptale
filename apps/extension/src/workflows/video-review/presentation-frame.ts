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
  const scale =
    framing.fit === 'cover'
      ? Math.max(output.width / source.width, output.height / source.height)
      : Math.min(output.width / source.width, output.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const panX = framing.fit === 'cover' ? framing.crop.panX : 0;
  const panY = framing.fit === 'cover' ? framing.crop.panY : 0;
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
    draw(
      context,
      ((output.width - width) * (panX + 1)) / 2,
      ((output.height - height) * (panY + 1)) / 2,
      width,
      height
    );
  } finally {
    context.restore();
  }
}
