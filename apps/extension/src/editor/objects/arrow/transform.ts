import type { EditorArrowSettings } from '../../../features/editor/document/types';
import type { ArrowPathInstance } from './controls.types';
import type { PointLike } from './types';

type UpdateArrowObjectFn = (
  arrow: ArrowPathInstance,
  options: { settings: EditorArrowSettings; points: PointLike[] }
) => void;

export function normalizeScaledArrowGeometry(
  arrow: ArrowPathInstance,
  settings: EditorArrowSettings,
  points: PointLike[],
  updateArrowObject: UpdateArrowObjectFn
): boolean {
  const scaleX = typeof arrow.scaleX === 'number' ? arrow.scaleX : 1;
  const scaleY = typeof arrow.scaleY === 'number' ? arrow.scaleY : 1;
  if (scaleX === 1 && scaleY === 1) {
    return false;
  }

  const nextPoints = points.map((point) =>
    scalePointAroundPathOffset(arrow, point, scaleX, scaleY)
  );

  arrow.set({ scaleX: 1, scaleY: 1 });
  updateArrowObject(arrow, {
    settings,
    points: nextPoints,
  });
  return true;
}

function scalePointAroundPathOffset(
  arrow: ArrowPathInstance,
  point: PointLike,
  scaleX: number,
  scaleY: number
): PointLike {
  const origin = arrow.pathOffset ?? { x: 0, y: 0 };
  return {
    x: origin.x + (point.x - origin.x) * scaleX,
    y: origin.y + (point.y - origin.y) * scaleY,
  };
}
