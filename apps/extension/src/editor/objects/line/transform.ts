import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import type { LinePathInstance, LinePoint } from './types';

type UpdateLineObjectFn = (
  line: LinePathInstance,
  options: { settings: EditorLineSettings; points: LinePoint[]; closed?: boolean }
) => void;

export function normalizeScaledLineGeometry(
  line: LinePathInstance,
  settings: EditorLineSettings,
  points: LinePoint[],
  updateLineObject: UpdateLineObjectFn
): boolean {
  const scaleX = typeof line.scaleX === 'number' ? line.scaleX : 1;
  const scaleY = typeof line.scaleY === 'number' ? line.scaleY : 1;
  if (scaleX === 1 && scaleY === 1) {
    return false;
  }

  const origin = line.pathOffset ?? { x: 0, y: 0 };
  const nextPoints = points.map((point) => ({
    x: origin.x + (point.x - origin.x) * scaleX,
    y: origin.y + (point.y - origin.y) * scaleY,
  }));

  line.set({ scaleX: 1, scaleY: 1 });
  updateLineObject(line, {
    settings,
    points: nextPoints,
    closed: line.sniptaleLineClosed,
  });
  return true;
}
