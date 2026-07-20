import type { TextCalloutFrame } from './frame';
import {
  type ArrowBubbleLayout,
  PANEL_RADIUS_RATIO,
  resolveBubbleLayoutForFrame,
  resolveClampedRadius,
} from './rounded-layout';

type PathTraceContext = Pick<
  CanvasRenderingContext2D,
  'arcTo' | 'beginPath' | 'closePath' | 'lineTo' | 'moveTo'
>;

function traceRoundedRectOpenPath(
  ctx: PathTraceContext,
  frame: TextCalloutFrame,
  radius: number
): void {
  const left = frame.left;
  const top = frame.top;
  const right = left + frame.width;
  const bottom = top + frame.height;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.arcTo(right, top, right, top + radius, radius);
  ctx.lineTo(right, bottom - radius);
  ctx.arcTo(right, bottom, right - radius, bottom, radius);
  ctx.lineTo(left + radius, bottom);
  ctx.arcTo(left, bottom, left, bottom - radius, radius);
  ctx.lineTo(left, top + radius);
  ctx.arcTo(left, top, left + radius, top, radius);
}

function traceRoundedRectPath(
  ctx: PathTraceContext,
  frame: TextCalloutFrame,
  radius: number
): void {
  traceRoundedRectOpenPath(ctx, frame, radius);
  ctx.closePath();
}

function traceBubblePath(
  ctx: PathTraceContext,
  layout: import('./rounded-layout').BubbleLayout
): void {
  traceBubblePathWithTail(ctx, layout, [
    [layout.centerX, layout.bottom],
    [layout.centerX - layout.tailHalfWidth, layout.bodyBottom],
  ]);
}

function traceArrowBubblePath(ctx: PathTraceContext, layout: ArrowBubbleLayout): void {
  traceBubblePathWithTail(ctx, layout, [
    [layout.centerX + layout.tailHalfWidth, layout.shoulderY],
    [layout.centerX, layout.bottom],
    [layout.centerX - layout.tailHalfWidth, layout.shoulderY],
    [layout.centerX - layout.tailHalfWidth, layout.bodyBottom],
  ]);
}

function traceBubblePathWithTail(
  ctx: PathTraceContext,
  layout: import('./rounded-layout').BubbleLayout,
  tailPoints: Array<[number, number]>
): void {
  traceRoundedRectOpenPath(
    ctx,
    {
      height: layout.bodyBottom - layout.top,
      left: layout.left,
      top: layout.top,
      width: layout.right - layout.left,
    },
    layout.radius
  );
  ctx.lineTo(layout.centerX + layout.tailHalfWidth, layout.bodyBottom);
  tailPoints.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
}

export function traceRoundedCalloutPath(
  ctx: PathTraceContext,
  format: 'arrow-bubble' | 'bubble' | 'panel',
  frame: TextCalloutFrame
): void {
  switch (format) {
    case 'panel':
      traceRoundedRectPath(
        ctx,
        frame,
        resolveClampedRadius(PANEL_RADIUS_RATIO, frame.width, frame.height)
      );
      return;
    case 'bubble':
      traceBubblePath(ctx, resolveBubbleLayoutForFrame(frame, 'bubble'));
      return;
    case 'arrow-bubble':
      traceArrowBubblePath(
        ctx,
        resolveBubbleLayoutForFrame(frame, 'arrow-bubble') as ArrowBubbleLayout
      );
  }
}
