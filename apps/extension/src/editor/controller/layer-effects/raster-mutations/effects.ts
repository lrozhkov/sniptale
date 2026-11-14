import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../../features/editor/document/effects';
import { isEditorRasterObject, previewEditorRasterEffects } from '../filters';
import {
  applyRasterEffectsToObject,
  getRasterEffectObject,
  ensureRasterObject,
  type LayerMutationContext,
  upsertEditorRasterEffect,
} from '../mutation-shared';

export async function applyEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effect: EditorRasterEffect;
    id: string;
  }
): Promise<void> {
  const object = getRasterEffectObject(context.canvas, context.id);
  if (!context.canvas || !object) return;
  if (object.sniptaleRole === 'background') {
    await context.rasterCorrections?.apply(
      context.id,
      (accepted) => upsertEditorRasterEffect(accepted, context.effect),
      false
    );
    return;
  }
  context.rasterCorrections?.reset();
  const token = context.createLayerMutationToken();
  const target = await ensureRasterObject(context, object, token);
  if (!target || !context.isLayerMutationTokenCurrent(token) || !isEditorRasterObject(target))
    return;
  applyRasterEffectsToObject(
    context,
    target,
    upsertEditorRasterEffect(target.sniptaleEffects ?? [], context.effect),
    context.canvas
  );
}

async function changeExistingRasterEffects(
  context: LayerMutationContext & { id: string },
  updateEffects: (accepted: EditorRasterEffect[]) => EditorRasterEffect[]
): Promise<void> {
  const object = getRasterEffectObject(context.canvas, context.id);
  if (!context.canvas || !object) {
    return;
  }

  if (object.sniptaleRole === 'background') {
    await context.rasterCorrections?.apply(context.id, updateEffects, false);
    return;
  }

  context.rasterCorrections?.reset();
  applyRasterEffectsToObject(
    context,
    object,
    updateEffects(object.sniptaleEffects ?? []),
    context.canvas
  );
}

export async function updateEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effect: EditorRasterEffect;
    id: string;
  }
): Promise<void> {
  await changeExistingRasterEffects(context, (accepted) =>
    upsertEditorRasterEffect(accepted, context.effect)
  );
}

export async function previewEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effect: EditorRasterEffect;
    id: string;
  }
): Promise<void> {
  const object = getRasterEffectObject(context.canvas, context.id);
  if (
    object &&
    context.rasterCorrections &&
    (object.sniptaleRole === 'background' || isEditorRasterObject(object))
  ) {
    await context.rasterCorrections?.apply(
      context.id,
      (accepted) => upsertEditorRasterEffect(accepted, context.effect),
      true
    );
    return;
  }
  if (!context.canvas || !object || !isEditorRasterObject(object)) {
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
  context.rasterCorrections?.reset();
  const object = getRasterEffectObject(context.canvas, context.id);
  if (
    !context.canvas ||
    !object ||
    object.sniptaleRole === 'background' ||
    !isEditorRasterObject(object)
  ) {
    return;
  }

  previewEditorRasterEffects(object, object.sniptaleEffects ?? []);
  context.canvas.requestRenderAll();
}

export async function removeEditorLayerRasterEffect(
  context: LayerMutationContext & {
    effectId: EditorRasterEffectId;
    id: string;
  }
): Promise<void> {
  await changeExistingRasterEffects(context, (accepted) =>
    accepted.filter((effect) => effect.id !== context.effectId)
  );
}
