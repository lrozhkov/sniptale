import type { Path } from 'fabric';
import type { FreehandPointRecord } from '../../points';

type FreehandPathCommand = NonNullable<Path['path']>[number];

export function buildClosedOutlinePath(
  points: readonly FreehandPointRecord[]
): Path['path'] | null {
  const firstPoint = points[0];
  if (!firstPoint) {
    return null;
  }

  return [
    ['M', firstPoint.x, firstPoint.y],
    ...points.slice(1).map<FreehandPathCommand>((point) => ['L', point.x, point.y]),
    ['Z'],
  ];
}
