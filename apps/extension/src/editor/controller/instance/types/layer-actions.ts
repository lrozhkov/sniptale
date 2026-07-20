import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../../features/editor/document/effects';
import type { EditorLayerTransformationId } from '../../layer-effects/registry';

export interface EditorControllerInstanceLayerActions {
  moveSelection(direction: 1 | -1): void;
  moveSelectionToEdge(edge: 'front' | 'back'): void;
  reorderLayer(draggedId: string, targetId: string): void;
  renameLayer(id: string, name: string): void;
  toggleLayerVisibility(id: string): void;
  toggleLayerLock(id: string): void;
  resizeLayer(id: string, width: number, height: number): void;
  mergeSelectedLayers(): Promise<void>;
  applyLayerEffect(id: string, effect: EditorRasterEffect): Promise<void>;
  updateLayerEffect(id: string, effect: EditorRasterEffect): Promise<void>;
  previewLayerEffect(id: string, effect: EditorRasterEffect): void;
  resetLayerEffectPreview(id: string): void;
  removeLayerEffect(id: string, effectId: EditorRasterEffectId): void;
  applyLayerTransformation(
    id: string,
    transformationId: EditorLayerTransformationId
  ): Promise<void>;
}
