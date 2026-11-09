import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import type { RuntimeCanvasContext, RuntimeLayerState } from '../model/types.js';
import { n, type RenderState, v, valueOr } from './model.js';
import { paintPrimitive, resolvePaint, withCommandStyle } from './painting.js';

type TextCommand = Extract<EffectV1Command, { op: 'text' }>;

export function drawText(
  command: TextCommand,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  withCommandStyle(
    command,
    layer,
    state,
    () => {
      const context = state.context;
      context.fillStyle = resolvePaint(command.fill ?? '#fff', context, state);
      context.textAlign = command.align ?? 'left';
      context.textBaseline = command.baseline ?? 'alphabetic';
      const size = valueOr(command.fontSize, 16, state);
      const fontFamily = String(v(command.fontFamily ?? 'system-ui', state));
      const fontWeight = v(command.fontWeight ?? 400, state);
      context.font = `${command.fontStyle ?? 'normal'} ${String(fontWeight)} ${size}px ${fontFamily}`;
      drawTextWithReveal(context, command, size, state);
    },
    true
  );
}

function drawTextWithReveal(
  context: RuntimeCanvasContext,
  command: TextCommand,
  size: number,
  state: RenderState
): void {
  const text = String(v(command.text, state));
  const maxWidth = n(command.maxWidth, state);
  const x = n(command.x, state);
  const y = n(command.y, state);
  const reveal = Math.max(0, Math.min(1, valueOr(command.reveal, 1, state)));
  const metrics = context.measureText(text);
  const measuredWidth = Math.min(metrics.width, maxWidth > 0 ? maxWidth : Number.POSITIVE_INFINITY);
  const compression = maxWidth > 0 && metrics.width > maxWidth ? maxWidth / metrics.width : 1;
  const ink = [
    metrics.actualBoundingBoxLeft,
    metrics.actualBoundingBoxRight,
    metrics.actualBoundingBoxAscent,
    metrics.actualBoundingBoxDescent,
  ];
  const bounds =
    text.length === 0
      ? null
      : ink.every(Number.isFinite)
        ? {
            x: x - metrics.actualBoundingBoxLeft * compression,
            y: y - metrics.actualBoundingBoxAscent,
            width: (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * compression,
            height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
          }
        : undefined;
  const left = textLeft(x, measuredWidth, command.align ?? 'left');
  if (reveal < 1) {
    context.save();
    context.beginPath();
    context.rect(left - 2, y - size, measuredWidth * reveal + 4, size * 2);
    if (!state.target?.isRawContext(context)) context.clip();
    const draw = () => paintPrimitive(state, () => fillText(context, text, x, y, maxWidth), bounds);
    if (state.target)
      state.target.clip(
        state,
        { x: left - 2, y: y - size, width: measuredWidth * reveal + 4, height: size * 2 },
        draw
      );
    else draw();
    context.restore();
  } else {
    paintPrimitive(state, () => fillText(context, text, x, y, maxWidth), bounds);
  }
  if (command.caret && reveal > 0 && reveal < 0.995 && context.globalAlpha > 0.1) {
    context.save();
    context.globalAlpha *= 0.82;
    paintPrimitive(
      state,
      () => context.fillRect(left + measuredWidth * reveal + 4, y - size * 0.48, 2, size * 0.96),
      { x: left + measuredWidth * reveal + 4, y: y - size * 0.48, width: 2, height: size * 0.96 }
    );
    context.restore();
  }
}

function fillText(
  context: RuntimeCanvasContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  if (maxWidth > 0) context.fillText(text, x, y, maxWidth);
  else context.fillText(text, x, y);
}

function textLeft(x: number, width: number, align: CanvasTextAlign): number {
  if (align === 'center') return x - width * 0.5;
  if (align === 'right' || align === 'end') return x - width;
  return x;
}
