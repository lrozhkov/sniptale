import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import {
  canvasCommentBubble,
  isCanvasCommentVisibleAt,
  overlayPulsePhase,
  type CanvasCommentExport,
} from '../../features/video/review/comments';
import { quickEditContentPointToCanvas } from '../../features/video/review/advanced/scene';
import { drawSceneGradient } from '../../features/video/project/scene/background-gradient-canvas';

/** Burns one attachment class after its matching scene layer has been drawn. */
export function drawReviewComments(
  context: CanvasRenderingContext2D,
  comments: readonly CanvasCommentExport[],
  args: {
    attachment: CanvasCommentExport['attachment'];
    canvas: { width: number; height: number };
    videoTransform: { x: number; y: number; width: number; height: number } | null;
    scale: number;
    sourceTime: number | undefined;
  }
): void {
  for (const comment of comments) {
    if (
      !comment.renderToVideo ||
      comment.attachment !== args.attachment ||
      (args.sourceTime !== undefined && !isCanvasCommentVisibleAt(comment, args.sourceTime))
    )
      continue;
    drawReviewComment(context, comment, args);
  }
}

function drawReviewComment(
  context: CanvasRenderingContext2D,
  comment: CanvasCommentExport,
  args: {
    canvas: { width: number; height: number };
    videoTransform: { x: number; y: number; width: number; height: number } | null;
    scale: number;
    sourceTime: number | undefined;
  }
): void {
  const point = args.videoTransform
    ? quickEditContentPointToCanvas(comment.position, args.videoTransform)
    : { x: comment.position.x * args.canvas.width, y: comment.position.y * args.canvas.height };
  const bubble = canvasCommentBubble(comment.style, {
    width: args.canvas.width / args.scale,
    height: args.canvas.height / args.scale,
  });
  const pointRadius = bubble.pointRadius * args.scale;
  const phase = overlayPulsePhase(args.sourceTime ?? 0, comment.start);
  context.save();
  if (phase > 0 && phase < 1) {
    const ringRadius = pointRadius * (1 + 1.4 * phase);
    context.globalAlpha = 0.35 * (1 - phase);
    context.fillStyle = DEFAULT_COLOR_ACCENT;
    context.beginPath();
    context.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }
  context.fillStyle = DEFAULT_COLOR_ACCENT;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2 * args.scale;
  context.beginPath();
  context.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  drawCommentBubble(context, comment, args, point, pointRadius, bubble);
  context.restore();
}

function drawCommentBubble(
  context: CanvasRenderingContext2D,
  comment: CanvasCommentExport,
  args: { scale: number },
  point: { x: number; y: number },
  pointRadius: number,
  bubble: ReturnType<typeof canvasCommentBubble>
): void {
  const text = comment.resolvedText;
  if (!text.trim()) return;
  const fontSize = bubble.fontSize * args.scale;
  const lineHeight = bubble.lineHeight * args.scale;
  const maxWidth = bubble.maxWidth * args.scale;
  const paddingX = bubble.paddingX * args.scale;
  const paddingY = bubble.paddingY * args.scale;
  const radius = comment.style.radius * args.scale;
  context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const maxHeight = bubble.maxHeight * args.scale;
  const maxLines = Math.max(1, Math.floor((maxHeight - paddingY * 2) / lineHeight));
  const lines = wrapCanvasText(context, text, Math.max(1, maxWidth - paddingX * 2), maxLines);
  const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const boxWidth = Math.min(maxWidth, textWidth + paddingX * 2);
  const boxHeight = Math.min(maxHeight, lines.length * lineHeight + paddingY * 2);
  const boxX = point.x - boxWidth / 2;
  const boxY =
    comment.placement === 'below'
      ? point.y + pointRadius + bubble.gap * args.scale
      : point.y - pointRadius - bubble.gap * args.scale - boxHeight;
  context.save();
  context.beginPath();
  context.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
  context.clip();
  const paint = comment.style.fillPaint;
  if (paint.kind === 'solid') {
    context.fillStyle = paint.color;
    context.fillRect(boxX, boxY, boxWidth, boxHeight);
  } else {
    context.translate(boxX, boxY);
    drawSceneGradient(context, paint.gradient, boxWidth, boxHeight);
  }
  context.restore();
  context.save();
  context.beginPath();
  context.rect(boxX, boxY, boxWidth, boxHeight);
  context.clip();
  context.fillStyle = comment.style.textColor;
  context.textBaseline = 'top';
  lines.forEach((line, index) => {
    context.fillText(line, boxX + paddingX, boxY + paddingY + index * lineHeight);
  });
  context.restore();
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        if (lines.length >= maxLines) return lines;
        current = word;
      } else current = candidate;
    }
    lines.push(current);
    if (lines.length >= maxLines) return lines;
  }
  return lines;
}
