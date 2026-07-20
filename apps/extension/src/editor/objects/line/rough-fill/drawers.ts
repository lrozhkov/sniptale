import type { EditorLineSettings } from '../../../../features/editor/document/line-types';

import { jitterLineRoughFillPoint, strokeLine } from './stroke';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawHachure(
  context: CanvasRenderingContext2D,
  settings: EditorLineSettings,
  size: number
): void {
  const gap = clamp(settings.roughFillGap, 2, 28);
  for (let offset = -size; offset <= size * 2; offset += gap) {
    strokeLine(context, settings, -size, offset, size * 2, offset, Math.round(offset * 10));
  }
}

function drawZigzag(
  context: CanvasRenderingContext2D,
  settings: EditorLineSettings,
  size: number
): void {
  const gap = clamp(settings.roughFillGap, 4, 28);
  const amplitude = Math.max(3, gap / 2);
  for (let offset = -size; offset <= size * 2; offset += gap) {
    for (let x = -size; x < size * 2; x += gap) {
      strokeLine(context, settings, x, offset, x + gap / 2, offset + amplitude, x + offset);
      strokeLine(
        context,
        settings,
        x + gap / 2,
        offset + amplitude,
        x + gap,
        offset,
        x + offset + 7
      );
    }
  }
}

function drawDots(
  context: CanvasRenderingContext2D,
  settings: EditorLineSettings,
  size: number
): void {
  const gap = clamp(settings.roughFillGap, 4, 28);
  const radius = Math.max(1, settings.roughFillWeight);
  for (let y = gap / 2; y < size; y += gap) {
    for (let x = gap / 2; x < size; x += gap) {
      context.beginPath();
      context.arc(
        jitterLineRoughFillPoint(x, settings, x + y),
        jitterLineRoughFillPoint(y, settings, x - y),
        radius,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
}

function drawDashed(
  context: CanvasRenderingContext2D,
  settings: EditorLineSettings,
  size: number
): void {
  const gap = clamp(settings.roughFillGap, 4, 28);
  const dash = Math.max(4, gap * 1.2);
  for (let offset = -size; offset <= size * 2; offset += gap) {
    for (let x = -size; x < size * 2; x += dash * 2) {
      strokeLine(context, settings, x, offset, x + dash, offset, x + offset);
    }
  }
}

export function drawLineRoughFillPattern(
  context: CanvasRenderingContext2D,
  settings: EditorLineSettings,
  size: number
): void {
  if (settings.roughFillStyle === 'solid') {
    context.fillRect(0, 0, size, size);
    return;
  }

  context.translate(size / 2, size / 2);
  context.rotate((settings.roughFillAngle * Math.PI) / 180);
  context.translate(-size / 2, -size / 2);

  if (settings.roughFillStyle === 'dots') {
    drawDots(context, settings, size);
    return;
  }
  if (settings.roughFillStyle === 'dashed') {
    drawDashed(context, settings, size);
    return;
  }
  if (settings.roughFillStyle === 'zigzag' || settings.roughFillStyle === 'zigzag-line') {
    drawZigzag(context, settings, size);
    return;
  }

  drawHachure(context, settings, size);
  if (settings.roughFillStyle === 'cross-hatch') {
    context.rotate(Math.PI / 2);
    drawHachure(context, settings, size);
  }
}
