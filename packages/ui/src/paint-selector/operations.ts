import {
  convertPaintType,
  createGradientPaint,
  getRepresentativeColor,
  normalizePaintColor,
  type GradientType,
  type Paint,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';

export function switchPaintMode(
  paint: Paint,
  mode: 'solid' | GradientType,
  createId: PaintStopIdFactory
): Paint {
  if (mode === 'solid') return { kind: 'solid', color: getRepresentativeColor(paint) };
  if (paint.kind === 'gradient') return convertPaintType(paint, mode, createId);
  const color = normalizePaintColor(paint.color) ?? '#00000000';
  return createGradientPaint(
    color.endsWith('00') ? `${color.slice(0, -2)}ff` : color,
    createId,
    mode
  );
}
