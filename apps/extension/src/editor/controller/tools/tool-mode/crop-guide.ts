import type { EditorTool } from '../../../../features/editor/document/types';

export function clearCropGuideIfNeeded(
  activeTool: EditorTool,
  hasCropGuide: boolean,
  clearCropSelection: () => void
): void {
  if (activeTool !== 'crop' && hasCropGuide) {
    clearCropSelection();
  }
}
