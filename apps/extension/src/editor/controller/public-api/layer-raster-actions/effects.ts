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
  createControllerLayerMutationContext,
  type LayerRasterMutationContextController,
} from './context';

export async function applyEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effect: EditorRasterEffect
): Promise<void> {
  await applyEditorLayerRasterEffect({
    ...createControllerLayerMutationContext(controller),
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
    ...createControllerLayerMutationContext(controller),
    id,
    effect,
  });
}

export function previewEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effect: EditorRasterEffect
): void {
  previewEditorLayerRasterEffect({
    ...createControllerLayerMutationContext(controller),
    id,
    effect,
  });
}

export function resetEditorControllerLayerEffectPreview(
  controller: LayerRasterMutationContextController,
  id: string
): void {
  resetEditorLayerRasterEffectPreview({
    ...createControllerLayerMutationContext(controller),
    id,
  });
}

export function removeEditorControllerLayerEffect(
  controller: LayerRasterMutationContextController,
  id: string,
  effectId: EditorRasterEffectId
): void {
  removeEditorLayerRasterEffect({
    ...createControllerLayerMutationContext(controller),
    id,
    effectId,
  });
}
