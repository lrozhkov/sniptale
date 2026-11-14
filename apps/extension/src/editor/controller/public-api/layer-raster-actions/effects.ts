import { getEditorRasterRuntime } from '../../../raster-editing/runtime';
import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../../features/editor/document/effects';
import {
  applyEditorLayerRasterEffect,
  previewEditorLayerRasterEffect,
  removeEditorLayerRasterEffect,
  resetEditorLayerRasterEffectPreview,
  updateEditorLayerRasterEffect,
} from '../../layer-effects/raster-mutations/effects';
import {
  createControllerLayerCorrectionContext,
  type LayerRasterMutationContextController,
} from './context';

export async function applyEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effect: EditorRasterEffect
): Promise<void> {
  await applyEditorLayerRasterEffect({
    ...createControllerLayerCorrectionContext(controller),
    effect,
    id,
  });
}

export async function updateEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effect: EditorRasterEffect
): Promise<void> {
  await updateEditorLayerRasterEffect({
    ...createControllerLayerCorrectionContext(controller),
    id,
    effect,
  });
}

export function previewEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effect: EditorRasterEffect
): void {
  void previewEditorLayerRasterEffect({
    ...createControllerLayerCorrectionContext(controller),
    id,
    effect,
  }).catch((error: unknown) => {
    if (controller.canvas) getEditorRasterRuntime(controller.canvas)?.reportError(error);
  });
}

export function resetEditorControllerLayerEffectPreview(
  controller: LayerRasterMutationContextController,
  id: string
): void {
  try {
    resetEditorLayerRasterEffectPreview({
      ...createControllerLayerCorrectionContext(controller),
      id,
    });
  } catch (error) {
    if (controller.canvas) getEditorRasterRuntime(controller.canvas)?.reportError(error);
  }
}

export function removeEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effectId: EditorRasterEffectId
): void {
  void removeEditorLayerRasterEffect({
    ...createControllerLayerCorrectionContext(controller),
    id,
    effectId,
  }).catch((error: unknown) => {
    if (controller.canvas) getEditorRasterRuntime(controller.canvas)?.reportError(error);
  });
}
