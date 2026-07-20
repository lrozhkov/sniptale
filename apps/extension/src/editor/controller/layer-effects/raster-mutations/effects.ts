import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../../features/editor/document/effects';
import { isEditorRasterObject, previewEditorRasterEffects } from '../filters';
import {
  applyRasterEffectsToObject,
  getEditableObject,
  type LayerMutationContext,
  upsertEditorRasterEffect,
} from '../mutation-shared';
import { resolveRasterizedMutationTarget } from './target';

export async function applyEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effect: EditorRasterEffect;
    id: string;
  }
): Promise<void> {
  const resolved = await resolveRasterizedMutationTarget(context);
  if (!resolved || !isEditorRasterObject(resolved.target)) {
    return;
  }

  applyRasterEffectsToObject(
    context,
    resolved.target,
    upsertEditorRasterEffect(resolved.target.sniptaleEffects ?? [], context.effect),
    resolved.canvas
  );
}

export async function updateEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effect: EditorRasterEffect;
    id: string;
  }
): Promise<void> {
  const object = getEditableObject(context.canvas, context.id);
  if (!context.canvas || !object) {
    return;
  }

  applyRasterEffectsToObject(
    context,
    object,
    upsertEditorRasterEffect(object.sniptaleEffects ?? [], context.effect),
    context.canvas
  );
}

export function previewEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effect: EditorRasterEffect;
    id: string;
  }
): void {
  const object = getEditableObject(context.canvas, context.id);
  if (!context.canvas || !isEditorRasterObject(object)) {
    return;
  }

  previewEditorRasterEffects(
    object,
    upsertEditorRasterEffect(object.sniptaleEffects ?? [], context.effect)
  );
  context.canvas.requestRenderAll();
}

export function resetEditorLayerRasterEffectPreview(
  context: LayerMutationContext & {
    id: string;
  }
): void {
  const object = getEditableObject(context.canvas, context.id);
  if (!context.canvas || !isEditorRasterObject(object)) {
    return;
  }

  previewEditorRasterEffects(object, object.sniptaleEffects ?? []);
  context.canvas.requestRenderAll();
}

export function removeEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effectId: EditorRasterEffectId;
    id: string;
  }
): void {
  const object = getEditableObject(context.canvas, context.id);
  if (!context.canvas || !object) {
    return;
  }

  applyRasterEffectsToObject(
    context,
    object,
    (object.sniptaleEffects ?? []).filter((effect) => effect.id !== context.effectId),
    context.canvas
  );
}
