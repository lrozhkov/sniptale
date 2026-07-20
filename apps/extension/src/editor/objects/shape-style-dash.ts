import type { EditorShapeSettings } from '../../features/editor/document/types';

export function createShapeStrokeDashArray(
  style: EditorShapeSettings['strokeStyle'],
  strokeWidth: number
): number[] | undefined {
  switch (style) {
    case 'dashed':
      return [Math.max(10, strokeWidth * 3), Math.max(6, strokeWidth * 1.6)];
    case 'dotted':
      return [Math.max(1, strokeWidth), Math.max(6, strokeWidth * 1.9)];
    case 'solid':
    default:
      return undefined;
  }
}
