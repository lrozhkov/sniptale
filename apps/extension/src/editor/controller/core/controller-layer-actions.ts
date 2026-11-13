import { flushEditorFreehandCompletion } from '../draw-workflow/released';
import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../features/editor/document/effects';
import {
  applyLayerEffectForController,
  applyLayerTransformationForController,
  mergeSelectedLayersForController,
  groupSelectedLayersForController,
  ungroupSelectedLayersForController,
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
    flushEditorFreehandCompletion(this.canvas);
    reorderLayerForController(this.getControllerInstance(), draggedId, targetId);
  }

  selectLayer(
    id: string,
    options: {
      additive?: boolean;
      focusViewport?: boolean;
      preserveActiveTool?: boolean;
      range?: boolean;
      toggle?: boolean;
    } = {}
  ) {
    flushEditorFreehandCompletion(this.canvas);
    selectLayerForController(this.getControllerInstance(), id, options);
  }

  renameLayer(id: string, name: string) {
    flushEditorFreehandCompletion(this.canvas);
    renameLayerForController(this.getControllerInstance(), id, name);
  }

  toggleLayerVisibility(id: string) {
    flushEditorFreehandCompletion(this.canvas);
    toggleLayerVisibilityForController(this.getControllerInstance(), id);
  }

  toggleLayerLock(id: string) {
    flushEditorFreehandCompletion(this.canvas);
    toggleLayerLockForController(this.getControllerInstance(), id);
  }

  resizeLayer(id: string, width: number, height: number) {
    flushEditorFreehandCompletion(this.canvas);
    resizeLayerForController(this.getControllerInstance(), id, width, height);
  }

  async mergeSelectedLayers() {
    flushEditorFreehandCompletion(this.canvas);
    await mergeSelectedLayersForController(this.getControllerInstance());
  }

  groupSelectedLayers() {
    flushEditorFreehandCompletion(this.canvas);
    return groupSelectedLayersForController(this.getControllerInstance());
  }

  ungroupSelectedLayers() {
    flushEditorFreehandCompletion(this.canvas);
    return ungroupSelectedLayersForController(this.getControllerInstance());
  }

  async applyLayerEffect(id: string, effect: EditorRasterEffect) {
    flushEditorFreehandCompletion(this.canvas);
    await applyLayerEffectForController(this.getControllerInstance(), id, effect);
  }

  async updateLayerEffect(id: string, effect: EditorRasterEffect) {
    flushEditorFreehandCompletion(this.canvas);
    await updateLayerEffectForController(this.getControllerInstance(), id, effect);
  }

  previewLayerEffect(id: string, effect: EditorRasterEffect) {
    flushEditorFreehandCompletion(this.canvas);
    previewLayerEffectForController(this.getControllerInstance(), id, effect);
  }

  resetLayerEffectPreview(id: string) {
    flushEditorFreehandCompletion(this.canvas);
    resetLayerEffectPreviewForController(this.getControllerInstance(), id);
  }

  removeLayerEffect(id: string, effectId: EditorRasterEffectId) {
    flushEditorFreehandCompletion(this.canvas);
    removeLayerEffectForController(this.getControllerInstance(), id, effectId);
  }

  async applyLayerTransformation(id: string, transformationId: EditorLayerTransformationId) {
    flushEditorFreehandCompletion(this.canvas);
    await applyLayerTransformationForController(this.getControllerInstance(), id, transformationId);
  }
}
