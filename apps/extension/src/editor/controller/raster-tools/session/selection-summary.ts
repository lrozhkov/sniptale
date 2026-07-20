import {
  EMPTY_EDITOR_RASTER_SELECTION_SUMMARY,
  type EditorRasterSelectionSummary,
} from '../../../state/raster-tools';
import { useEditorStore } from '../../../state/useEditorStore';
import type { EditorRasterSelectionMask } from '../../raster/types';

export function syncEditorRasterSelectionSummary(
  selection: EditorRasterSelectionMask | null
): void {
  useEditorStore.setState({
    rasterSelection: getEditorRasterSelectionSummary(selection),
  });
}

export function getEditorRasterSelectionSummary(
  selection: EditorRasterSelectionMask | null
): EditorRasterSelectionSummary {
  return selection
    ? {
        hasSelection: true,
        targetLayerId: selection.reference.objectId,
        targetLayerName: selection.reference.objectName,
      }
    : EMPTY_EDITOR_RASTER_SELECTION_SUMMARY;
}
