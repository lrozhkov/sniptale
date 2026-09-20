import {
  quickEditSpotlightPath,
  type QuickEditSpotlightFrame,
} from '../../features/video/review/advanced/focus';

/** Snapshot before filtering prevents feedback and includes both video and scene background. */
export function drawReviewSpotlight(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement | null,
  frame: QuickEditSpotlightFrame | null
) {
  if (!frame) return;
  if (frame.blur > 0 && scratch) {
    const copy = scratch.getContext('2d');
    if (!copy) throw new Error('Spotlight compositor is unavailable.');
    copy.clearRect(0, 0, scratch.width, scratch.height);
    copy.drawImage(canvas, 0, 0);
  }
  context.save();
  context.clip(new Path2D(quickEditSpotlightPath(canvas, frame)), 'evenodd');
  if (frame.blur > 0 && scratch) {
    context.filter = `blur(${frame.blur}px)`;
    context.drawImage(scratch, 0, 0);
    context.filter = 'none';
  }
  if (frame.dim > 0) {
    context.fillStyle = `rgba(0,0,0,${frame.dim})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.restore();
}
