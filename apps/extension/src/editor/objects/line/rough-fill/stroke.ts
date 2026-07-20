import type { EditorLineSettings } from '../../../../features/editor/document/line-types';

function createNoise(seed: number, index: number): number {
  const raw = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}

export function jitterLineRoughFillPoint(
  value: number,
  settings: EditorLineSettings,
  index: number
): number {
  const amount = settings.roughFillRoughness * Math.max(0.5, settings.roughFillWeight * 0.6);
  return value + createNoise(31, index) * amount;
}

export function strokeLine(
  context: CanvasRenderingContext2D,
  settings: EditorLineSettings,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  index: number
): void {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const bow = settings.roughFillBowing * settings.roughFillWeight * 0.8;
  context.beginPath();
  context.moveTo(
    jitterLineRoughFillPoint(fromX, settings, index),
    jitterLineRoughFillPoint(fromY, settings, index + 1)
  );
  context.quadraticCurveTo(
    jitterLineRoughFillPoint(midX, settings, index + 2),
    jitterLineRoughFillPoint(midY + bow, settings, index + 3),
    jitterLineRoughFillPoint(toX, settings, index + 4),
    jitterLineRoughFillPoint(toY, settings, index + 5)
  );
  context.stroke();
}
