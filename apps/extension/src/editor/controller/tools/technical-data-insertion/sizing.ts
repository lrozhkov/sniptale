import type { EditorTechnicalDataLayout } from '../../../../features/editor/document/technical-data';

export function getTechnicalDataTextWidth(
  layout: EditorTechnicalDataLayout,
  availableWidth: number
): number {
  return layout === 'row' ? availableWidth : Math.min(640, availableWidth);
}
