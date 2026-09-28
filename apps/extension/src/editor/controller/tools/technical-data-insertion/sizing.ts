import type { EditorTechnicalDataLayout } from '../technical-data';

export function getTechnicalDataTextWidth(
  layout: EditorTechnicalDataLayout,
  availableWidth: number
): number {
  return layout === 'row' ? availableWidth : Math.min(360, availableWidth);
}
