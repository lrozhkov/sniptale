import type { QuickEditBorderFrame } from '../../features/video/review/advanced/border';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

/** The same Canvas stroke adapter paints inspector, stage and encoded frames. */
export function drawReviewBorders(
  context: CanvasRenderingContext2D,
  output: { width: number; height: number },
  frames: readonly QuickEditBorderFrame[],
  clip?: { rect: QuickEditRect; radius: number }
) {
  if (!frames.length) return;
  const layer = document.createElement('canvas');
  layer.width = output.width;
  layer.height = output.height;
  const mask = document.createElement('canvas');
  mask.width = output.width;
  mask.height = output.height;
  const reveal = mask.getContext('2d');
  const stroke = layer.getContext('2d');
  if (!stroke || !reveal) throw new Error('Border compositor is unavailable.');
  context.save();
  if (clip) {
    context.beginPath();
    stroke.lineCap = 'butt';
    context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
    context.clip();
  }
  for (const frame of frames) {
    const length = Math.min(1, Math.max(0, frame.end - frame.start));
    if (!length || !frame.opacity) continue;
    stroke.clearRect(0, 0, layer.width, layer.height);
    stroke.save();
    const path = new Path2D(frame.path);
    stroke.lineWidth = frame.width;
    stroke.strokeStyle = frame.color;
    stroke.lineCap = frame.style === 'dotted' ? 'round' : 'butt';
    stroke.setLineDash(
      frame.style === 'dashed'
        ? [3 * frame.width, 2 * frame.width]
        : frame.style === 'dotted'
          ? [0, 2 * frame.width]
          : []
    );
    stroke.stroke(path);
    if (length < 1) {
      // Mask the patterned stroke; its dash phase never moves with the reveal interval.
      reveal.clearRect(0, 0, mask.width, mask.height);
      reveal.lineCap = 'butt';
      reveal.lineWidth = frame.width + 2;
      reveal.strokeStyle = '#ffffff';
      reveal.setLineDash([length * frame.perimeter, (1 - length) * frame.perimeter]);
      reveal.lineDashOffset = -frame.start * frame.perimeter;
      reveal.stroke(path);
      stroke.globalCompositeOperation = 'destination-in';
      stroke.drawImage(mask, 0, 0);
    }
    stroke.restore();
    context.globalAlpha = frame.opacity;
    context.drawImage(layer, 0, 0);
  }
  context.restore();
}
