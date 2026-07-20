import type { EditorLineStyle } from '../../../features/editor/document/line-types';

export function isLineStyle(value: unknown): value is EditorLineStyle {
  return (
    value === 'solid' ||
    value === 'dash' ||
    value === 'dot' ||
    value === 'dash-dot' ||
    value === 'long-dash'
  );
}
