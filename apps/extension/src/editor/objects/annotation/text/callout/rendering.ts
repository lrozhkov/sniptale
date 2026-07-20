import type { Textbox } from 'fabric';

import { clamp } from '../../../../document/model';
import { applyCanvasShadow } from '../../../shadow';
import { getTextCalloutPath, traceTextCalloutPath } from '../formats';
import { getTextCalloutFrame } from '../geometry';
import { getTextCalloutDimensions } from './dimensions';
import { resolveTextCalloutFormat } from './format';

type CalloutFrame = ReturnType<typeof getTextCalloutFrame>;

function getCalloutFill(textbox: Textbox): string | null {
  const fill = textbox.backgroundColor;
  return typeof fill === 'string' && fill.trim().length > 0 ? fill : null;
}

function getCalloutOpacity(textbox: Textbox): number {
  return clamp(textbox.sniptaleTextBackgroundOpacity ?? 1, 0, 1);
}

function fillFallbackRect(ctx: CanvasRenderingContext2D, frame: CalloutFrame, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(frame.left, frame.top, frame.width, frame.height);
}

function fillSvgCalloutPath(
  ctx: CanvasRenderingContext2D,
  format: ReturnType<typeof resolveTextCalloutFormat>,
  pathData: string,
  frame: CalloutFrame,
  fill: string
): void {
  ctx.fillStyle = fill;
  if (typeof Path2D !== 'undefined') {
    ctx.fill(new Path2D(pathData));
    return;
  }

  if (traceTextCalloutPath(ctx, format, frame)) {
    ctx.fill();
    return;
  }

  fillFallbackRect(ctx, frame, fill);
}

export function renderTextCalloutBackground(textbox: Textbox, ctx: CanvasRenderingContext2D): void {
  const format = resolveTextCalloutFormat(textbox);
  const frame = getTextCalloutFrame(getTextCalloutDimensions(textbox));
  const pathData = getTextCalloutPath(format, frame);
  const fill = getCalloutFill(textbox);

  if (!pathData || !fill) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = getCalloutOpacity(textbox);
  const shadowAngle =
    typeof textbox.sniptaleTextShadowAngle === 'number' ? textbox.sniptaleTextShadowAngle : 90;
  const shadowBlur =
    typeof textbox.sniptaleTextShadowBlur === 'number' ? textbox.sniptaleTextShadowBlur : 12;
  const shadowDistance =
    typeof textbox.sniptaleTextShadowDistance === 'number' ? textbox.sniptaleTextShadowDistance : 4;
  applyCanvasShadow(ctx, textbox.sniptaleTextCalloutShadow, fill, {
    angle: shadowAngle,
    blur: shadowBlur,
    distance: shadowDistance,
  });
  fillSvgCalloutPath(ctx, format, pathData, frame, fill);
  ctx.restore();
}
