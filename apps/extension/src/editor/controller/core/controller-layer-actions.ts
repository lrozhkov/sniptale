import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../features/editor/document/effects';
import {
  applyLayerEffectForController,
  applyLayerTransformationForController,
  mergeSelectedLayersForController,
  previewLayerEffectForController,
  removeLayerEffectForController,
  renameLayerForController,
  reorderLayerForController,
  resetLayerEffectPreviewForController,
  resizeLayerForController,
  selectLayerForController,
  toggleLayerLockForController,
  toggleLayerVisibilityForController,
  updateLayerEffectForController,
} from '../instance/actions/selection';
import type { EditorLayerTransformationId } from '../layer-effects/registry';
import { ImageEditorControllerCropActions } from './controller-crop-actions';

export abstract class ImageEditorControllerLayerActions extends ImageEditorControllerCropActions {
  reorderLayer(draggedId: string, targetId: string) {
    reorderLayerForController(this.getControllerInstance(), draggedId, targetId);
  }

  selectLayer(
    id: string,
    options: { additive?: boolean; focusViewport?: boolean; range?: boolean; toggle?: boolean } = {}
  ) {
    selectLayerForController(this.getControllerInstance(), id, options);
  }

  renameLayer(id: string, name: string) {
    renameLayerForController(this.getControllerInstance(), id, name);
  }

  toggleLayerVisibility(id: string) {
    toggleLayerVisibilityForController(this.getControllerInstance(), id);
  }

  toggleLayerLock(id: string) {
    toggleLayerLockForController(this.getControllerInstance(), id);
  }

  resizeLayer(id: string, width: number, height: number) {
    resizeLayerForController(this.getControllerInstance(), id, width, height);
  }

  async mergeSelectedLayers() {
    await mergeSelectedLayersForController(this.getControllerInstance());
  }

  async applyLayerEffect(id: string, effect: EditorRasterEffect) {
    await applyLayerEffectForController(this.getControllerInstance(), id, effect);
  }

  async updateLayerEffect(id: string, effect: EditorRasterEffect) {
    await updateLayerEffectForController(this.getControllerInstance(), id, effect);
  }

  previewLayerEffect(id: string, effect: EditorRasterEffect) {
    previewLayerEffectForController(this.getControllerInstance(), id, effect);
  }

  resetLayerEffectPreview(id: string) {
    resetLayerEffectPreviewForController(this.getControllerInstance(), id);
  }

  removeLayerEffect(id: string, effectId: EditorRasterEffectId) {
    removeLayerEffectForController(this.getControllerInstance(), id, effectId);
  }

  async applyLayerTransformation(id: string, transformationId: EditorLayerTransformationId) {
    await applyLayerTransformationForController(this.getControllerInstance(), id, transformationId);
  }
}
