import { type Control } from 'fabric';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { LinePathInstance, LinePoint } from '../types';
import { createLineMidpointControl } from './midpoint';
import { createLinePointControl } from './point';

export function createLineControls(
  line: LinePathInstance,
  updateLineObject: (
    line: LinePathInstance,
    options: { settings: EditorLineSettings; points: LinePoint[]; closed?: boolean }
  ) => void
): Record<string, Control> {
  const controls: Record<string, Control> = {};
  line.sniptaleLinePoints.forEach((_point, index) => {
    controls[`p${index}`] = createLinePointControl(index, updateLineObject);
  });
  const midpointCount = line.sniptaleLineClosed
    ? line.sniptaleLinePoints.length
    : Math.max(0, line.sniptaleLinePoints.length - 1);
  for (let index = 0; index < midpointCount; index += 1) {
    controls[`m${index}`] = createLineMidpointControl(index, updateLineObject, createLineControls);
  }
  return controls;
}
