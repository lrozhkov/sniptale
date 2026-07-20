import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import type { RuntimeCanvasContext, RuntimeLayerState } from '../model/types.js';
import { n, type RenderState, v, valueOr } from './model.js';
import { resolvePaint, withCommandStyle } from './painting.js';

type TextCommand = Extract<EffectV1Command, { op: 'text' }>;

export function drawText(
  command: TextCommand,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  withCommandStyle(command, layer, state, () => {
    const context = state.context;
    context.fillStyle = resolvePaint(command.fill ?? '#fff', context, state);
    context.textAlign = command.align ?? 'left';
    context.textBaseline = command.baseline ?? 'alphabetic';
    const size = valueOr(command.fontSize, 16, state);
    const fontFamily = String(v(command.fontFamily ?? 'system-ui', state));
    const fontWeight = v(command.fontWeight ?? 400, state);
    context.font = `${command.fontStyle ?? 'normal'} ${String(fontWeight)} ${size}px ${fontFamily}`;
    drawTextWithReveal(context, command, size, state);
  });
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
  const measuredWidth = Math.min(
    context.measureText(text).width,
    maxWidth > 0 ? maxWidth : Number.POSITIVE_INFINITY
  );
  const left = textLeft(x, measuredWidth, command.align ?? 'left');
  if (reveal < 1) {
    context.save();
    context.beginPath();
    context.rect(left - 2, y - size, measuredWidth * reveal + 4, size * 2);
    context.clip();
    fillText(context, text, x, y, maxWidth);
    context.restore();
  } else {
    fillText(context, text, x, y, maxWidth);
  }
  if (command.caret && reveal > 0 && reveal < 0.995 && context.globalAlpha > 0.1) {
    context.save();
    context.globalAlpha *= 0.82;
    context.fillRect(left + measuredWidth * reveal + 4, y - size * 0.48, 2, size * 0.96);
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
