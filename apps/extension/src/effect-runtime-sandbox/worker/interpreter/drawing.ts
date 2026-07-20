import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import type { RuntimeBitmapAsset } from '../assets/render-assets.js';
import type { RuntimeCanvasContext, RuntimeLayerState } from '../model/types.js';
import { n, type RenderState, valueOr } from './model.js';
import { paintPath, withCommandStyle } from './painting.js';
import { drawCanvasPathSegments } from './path-drawing.js';

export { drawText } from './drawing-text.js';

type ShapeCommand = Extract<EffectV1Command, { op: 'shape' }>;
type ImageCommand = Extract<EffectV1Command, { op: 'image' }>;
type PathCommand = Extract<EffectV1Command, { op: 'path' | 'polyline' }>;
interface Point {
  x: number;
  y: number;
}

export function drawShape(
  command: ShapeCommand,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  withCommandStyle(command, layer, state, () => {
    const context = state.context;
    const x = n(command.x, state);
    const y = n(command.y, state);
    const width = n(command.width, state);
    const height = n(command.height, state);
    context.translate(x + width / 2, y + height / 2);
    context.rotate(n(command.rotation, state));
    context.beginPath();
    drawShapeGeometry(context, command, width, height, state);
    paintPath(command, state);
  });
}

function drawShapeGeometry(
  context: RuntimeCanvasContext,
  command: ShapeCommand,
  width: number,
  height: number,
  state: RenderState
): void {
  if (command.shape === 'circle') {
    context.arc(0, 0, Math.min(width, height) / 2, 0, Math.PI * 2);
  } else if (command.shape === 'ellipse') {
    context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (command.shape === 'diamond') {
    context.moveTo(0, -height / 2);
    context.lineTo(width / 2, 0);
    context.lineTo(0, height / 2);
    context.lineTo(-width / 2, 0);
    context.closePath();
  } else if (command.shape === 'roundRect') {
    context.roundRect(-width / 2, -height / 2, width, height, n(command.radius, state));
  } else {
    context.rect(-width / 2, -height / 2, width, height);
  }
}

export function drawImage(
  command: ImageCommand,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  const input = command.input ? state.scope.context.inputFrames[command.input] : undefined;
  const stored = command.assetId ? state.scope.context.assets[command.assetId] : undefined;
  const asset: RuntimeBitmapAsset | undefined = input
    ? { bitmap: input }
    : stored?.kind === 'image'
      ? stored
      : undefined;
  if (!asset) return;
  withCommandStyle(command, layer, state, () => {
    state.runtime.drawImageAsset(state.context, asset, {
      alpha: 1,
      composite: state.context.globalCompositeOperation,
      filter: state.context.filter,
      fit: command.fit ?? 'contain',
      height: n(command.height, state),
      rotate: n(command.rotation, state),
      shadowBlur: state.context.shadowBlur,
      shadowColor: state.context.shadowColor,
      width: n(command.width, state),
      x: n(command.x, state),
      y: n(command.y, state),
    });
  });
}

export function drawPath(
  command: PathCommand,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  if (command.op === 'path' && command.segments) {
    drawSegmentPath(command, layer, state);
    return;
  }
  const points = (command.points ?? []).map((point) => ({
    x: n(point.x, state),
    y: n(point.y, state),
  }));
  if (points.length < 2) return;
  const visible = trimPolyline(
    points,
    command.op === 'polyline' ? valueOr(command.progress, 1, state) : 1
  );
  withCommandStyle(command, layer, state, () => {
    const context = state.context;
    context.beginPath();
    context.moveTo(visible[0]!.x, visible[0]!.y);
    for (const point of visible.slice(1)) context.lineTo(point.x, point.y);
    if (command.op === 'path' && command.closed) context.closePath();
    paintPath(command, state);
  });
}

function drawSegmentPath(
  command: Extract<EffectV1Command, { op: 'path' }>,
  layer: RuntimeLayerState | null,
  state: RenderState
): void {
  if (!command.segments?.length) return;
  withCommandStyle(command, layer, state, () => {
    drawCanvasPathSegments(command, state);
    paintPath(command, state);
  });
}

function trimPolyline(points: Point[], progress: number): Point[] {
  if (progress >= 1) return points;
  if (progress <= 0) return [points[0]!, points[0]!];
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const target = lengths.reduce((sum, value) => sum + value, 0) * progress;
  const result = [points[0]!];
  let consumed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (consumed + length <= target) {
      result.push(points[index + 1]!);
      consumed += length;
      continue;
    }
    const ratio = length > 0 ? (target - consumed) / length : 0;
    result.push({
      x: points[index]!.x + (points[index + 1]!.x - points[index]!.x) * ratio,
      y: points[index]!.y + (points[index + 1]!.y - points[index]!.y) * ratio,
    });
    break;
  }
  return result;
}
