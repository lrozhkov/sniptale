import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../../features/editor/document/effects';
import {
  applyEditorControllerLayerEffect,
  previewEditorControllerLayerEffect,
  removeEditorControllerLayerEffect,
  resetEditorControllerLayerEffectPreview,
  updateEditorControllerLayerEffect,
} from '../../public-api/layer-raster-actions/effects';
import type { EditorControllerInstance } from '../types';

export async function applyLayerEffectForController(
  controller: EditorControllerInstance,
  id: string,
  effect: EditorRasterEffect
): Promise<void> {
  await applyEditorControllerLayerEffect(controller.getPublicApiAdapter(), id, effect);
}

export async function updateLayerEffectForController(
  controller: EditorControllerInstance,
  id: string,
  effect: EditorRasterEffect
): Promise<void> {
  await updateEditorControllerLayerEffect(controller.getPublicApiAdapter(), id, effect);
}

export function previewLayerEffectForController(
  controller: EditorControllerInstance,
  id: string,
  effect: EditorRasterEffect
): void {
  previewEditorControllerLayerEffect(controller.getPublicApiAdapter(), id, effect);
}

export function resetLayerEffectPreviewForController(
  controller: EditorControllerInstance,
  id: string
): void {
  resetEditorControllerLayerEffectPreview(controller.getPublicApiAdapter(), id);
}

export function removeLayerEffectForController(
  controller: EditorControllerInstance,
  id: string,
  effectId: EditorRasterEffectId
): void {
  removeEditorControllerLayerEffect(controller.getPublicApiAdapter(), id, effectId);
}
