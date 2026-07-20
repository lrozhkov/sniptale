import type { Canvas, FabricObject } from 'fabric';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import { findObjectById } from '../document/layers';

import type { SourceState } from '../../document/model/source-state';
import { applyEditorRasterEffects, isEditorRasterObject } from './filters';
import { buildRasterizedSourceState } from './rasterize/source-state';
import { createRasterizedEditorImage } from './rasterize/image-object';
import { isEditorRasterLayerType } from './rasterize/layer-type';
import { rasterizeEditorObjects } from './rasterize/render-data';

export type LayerMutationContext = {
  canvas: Canvas | null;
  source: SourceState | null;
  setSource: (source: SourceState | null) => void;
  prepareObject: (object: FabricObject) => void;
  sendFrameObjectsToBack: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
  createLayerMutationToken: () => number;
  isLayerMutationTokenCurrent: (token: number) => boolean;
};

export function getEditableObject(canvas: Canvas | null, id: string): FabricObject | null {
  const object = findObjectById(canvas, id);
  return object && !object.sniptaleLocked ? object : null;
}

export function moveObjectToIndex(canvas: Canvas, object: FabricObject, index: number) {
  const boundedIndex = Math.max(0, Math.min(index, Math.max(canvas.getObjects().length - 1, 0)));
  canvas.moveObjectTo(object, boundedIndex);
}

async function replaceObjectWithRasterizedImage(
  context: LayerMutationContext,
  object: FabricObject,
  mutationToken: number
): Promise<FabricObject | null> {
  const { canvas } = context;
  if (!canvas) {
    return null;
  }

  const renderData = rasterizeEditorObjects(canvas, [object]);
  if (!renderData) {
    return null;
  }

  const targetIndex = canvas.getObjects().indexOf(object);
  const replacement = await createRasterizedEditorImage({
    dataUrl: renderData.dataUrl,
    id: object.sniptaleId ?? crypto.randomUUID(),
    left: renderData.bounds.left,
    locked: Boolean(object.sniptaleLocked),
    name: object.sniptaleLabel ?? 'Layer',
    role: object.sniptaleType === 'source-image' ? 'source' : 'annotation',
    top: renderData.bounds.top,
    type: object.sniptaleType === 'source-image' ? 'source-image' : 'image',
    visible: object.visible !== false,
  });
  if (!context.isLayerMutationTokenCurrent(mutationToken)) {
    return null;
  }

  context.prepareObject(replacement);
  canvas.remove(object);
  canvas.add(replacement);
  moveObjectToIndex(canvas, replacement, targetIndex);
  if (replacement.sniptaleType === 'source-image') {
    context.sendFrameObjectsToBack();
  }
  canvas.setActiveObject(replacement);
  canvas.requestRenderAll();
  context.setSource(buildRasterizedSourceState(context.source, replacement));

  return replacement;
}

export async function ensureRasterObject(
  context: LayerMutationContext,
  object: FabricObject,
  mutationToken: number
): Promise<FabricObject | null> {
  if (isEditorRasterLayerType(object.sniptaleType)) {
    return object;
  }

  return replaceObjectWithRasterizedImage(context, object, mutationToken);
}

export function syncSourceFromObject(context: LayerMutationContext, object: FabricObject) {
  context.setSource(buildRasterizedSourceState(context.source, object));
}

export function commitLayerMutation(context: LayerMutationContext, canvas: Canvas) {
  canvas.requestRenderAll();
  context.commitHistory();
  context.syncRuntimeState();
}

export function upsertEditorRasterEffect(
  effects: EditorRasterEffect[],
  effect: EditorRasterEffect
): EditorRasterEffect[] {
  const nextEffects = effects.filter((item) => item.id !== effect.id);
  nextEffects.push(effect);
  return nextEffects;
}

export function applyRasterEffectsToObject(
  context: LayerMutationContext,
  object: FabricObject,
  effects: EditorRasterEffect[],
  canvas: Canvas
) {
  if (!isEditorRasterObject(object)) {
    return;
  }

  applyEditorRasterEffects(object, effects);
  syncSourceFromObject(context, object);
  commitLayerMutation(context, canvas);
}
