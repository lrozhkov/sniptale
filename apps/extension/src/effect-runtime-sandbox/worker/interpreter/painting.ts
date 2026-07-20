import type {
  EffectV1Command,
  EffectV1Paint,
  EffectV1Shadow,
} from '@sniptale/runtime-contracts/effect-v1';

import { getLogicalCanvasScale } from '../canvas/logical-canvas.js';
import type { RuntimeCanvasContext, RuntimeLayerState } from '../model/types.js';
import { isRecord, n, type RenderState, v, valueOr } from './model.js';

type PaintedCommand = Extract<EffectV1Command, { op: 'path' | 'polyline' | 'shape' }>;
type GradientPaint = Extract<EffectV1Paint, { kind: 'linearGradient' | 'radialGradient' }>;

interface CommandStyleSource {
  alpha?: unknown;
  blend?: 'lighter' | 'screen' | 'source-over';
  filter?: unknown;
  shadow?: EffectV1Shadow;
}

export function paintPath(command: PaintedCommand, state: RenderState): void {
  const context = state.context;
  const fill = command.op === 'polyline' ? undefined : command.fill;
  if (fill != null) {
    context.fillStyle = resolvePaint(fill, context, state);
    context.fill();
  }
  if (command.stroke != null) {
    context.strokeStyle = resolvePaint(command.stroke, context, state);
    context.lineWidth = valueOr(command.lineWidth, 1, state);
    context.lineCap = command.op === 'shape' ? 'butt' : (command.lineCap ?? 'butt');
    context.lineJoin = command.op === 'shape' ? 'miter' : (command.lineJoin ?? 'miter');
    context.stroke();
  }
}

export function withCommandStyle(
  command: CommandStyleSource,
  layer: RuntimeLayerState | null,
  state: RenderState,
  draw: () => void
): void {
  state.context.save();
  try {
    applyCommandStyle(command, layer, state);
    draw();
  } finally {
    state.context.restore();
  }
}

export async function withSavedState(
  command: CommandStyleSource,
  layer: RuntimeLayerState | null,
  state: RenderState,
  draw: () => Promise<void>
): Promise<void> {
  state.context.save();
  try {
    applyCommandStyle(command, layer, state);
    await draw();
  } finally {
    state.context.restore();
  }
}

function applyCommandStyle(
  command: CommandStyleSource,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  const context = state.context;
  context.globalAlpha *= valueOr(command.alpha, 1, state) * (layer?.opacity ?? 1);
  if (command.blend) context.globalCompositeOperation = command.blend;
  if (command.filter) context.filter = resolveFilter(command.filter, state);
  if (command.shadow) applyShadow(command.shadow, state);
  context.translate(layer?.x ?? 0, layer?.y ?? 0);
}

function applyShadow(value: EffectV1Shadow, state: RenderState): void {
  const scale = getLogicalCanvasScale(state.context);
  state.context.shadowBlur = n(value.blur, state) * scale.uniform;
  state.context.shadowColor = String(v(value.color ?? 'transparent', state));
  state.context.shadowOffsetX = n(value.x, state) * scale.x;
  state.context.shadowOffsetY = n(value.y, state) * scale.y;
}

export function resolvePaint(
  value: EffectV1Paint,
  context: RuntimeCanvasContext,
  state: RenderState
): string | CanvasGradient | CanvasPattern {
  if (!isRecord(value) || 'op' in value) return String(v(value, state) ?? 'transparent');
  if (!('kind' in value)) return 'transparent';
  const gradient = createGradient(value, context, state);
  for (const stop of value.stops) {
    gradient.addColorStop(n(stop.offset, state), String(v(stop.color, state)));
  }
  return gradient;
}

function createGradient(
  value: GradientPaint,
  context: RuntimeCanvasContext,
  state: RenderState
): CanvasGradient {
  return value.kind === 'linearGradient'
    ? context.createLinearGradient(
        n(value.x0, state),
        n(value.y0, state),
        n(value.x1, state),
        n(value.y1, state)
      )
    : context.createRadialGradient(
        n(value.x0, state),
        n(value.y0, state),
        n(value.r0, state),
        n(value.x1, state),
        n(value.y1, state),
        n(value.r1, state)
      );
}

export function resolveFilter(value: unknown, state: RenderState): string {
  if (!isRecord(value)) return 'none';
  const parts: string[] = [];
  if (value['blur'] !== undefined) {
    const scale = getLogicalCanvasScale(state.context).uniform;
    parts.push(`blur(${Math.max(0, n(value['blur'], state) * scale)}px)`);
  }
  if (value['brightness'] !== undefined) {
    parts.push(`brightness(${Math.max(0, n(value['brightness'], state))})`);
  }
  if (value['saturate'] !== undefined) {
    parts.push(`saturate(${Math.max(0, n(value['saturate'], state))})`);
  }
  return parts.join(' ') || 'none';
}
