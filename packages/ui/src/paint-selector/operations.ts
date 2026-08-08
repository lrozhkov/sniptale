import {
  convertPaintType,
  createGradientPaint,
  getRepresentativeColor,
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
  return paint.kind === 'solid'
    ? createGradientPaint(paint.color, createId, mode)
    : convertPaintType(paint, mode, createId);
}
