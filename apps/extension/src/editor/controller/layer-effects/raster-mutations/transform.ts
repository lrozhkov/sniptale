import { isManagedBackgroundObject } from '../../background/identity';
import { FabricImage } from 'fabric';
import { findObjectById, findRasterContentObject } from '../../document/layers';
import type { EditorLayerTransformationId } from '../registry';
import {
  commitLayerMutation,
  ensureRasterObject,
  getEditableObject,
  syncSourceFromObject,
  type LayerMutationContext,
} from '../mutation-shared';

export async function applyEditorLayerTransformation(
  context: LayerMutationContext & {
    id: string;
    transformationId: EditorLayerTransformationId;
  }
): Promise<void> {
  const isFlip =
    context.transformationId === 'flip-horizontal' || context.transformationId === 'flip-vertical';
  const ordinary = findObjectById(context.canvas, context.id);
  const raster =
    (ordinary instanceof FabricImage &&
      (ordinary.sniptaleType === 'image' || ordinary.sniptaleType === 'source-image')) ||
    (ordinary &&
      isManagedBackgroundObject(ordinary) &&
      ordinary.sniptaleBackgroundMode === 'image');
  const object = isFlip
    ? (findRasterContentObject(context.canvas, context.id) ??
      (!raster ? getEditableObject(context.canvas, context.id) : null))
    : getEditableObject(context.canvas, context.id);
  if (!context.canvas || !object) {
    return;
  }

  const mutationToken = context.createLayerMutationToken();
  const target =
    context.transformationId === 'resize-layer'
      ? await ensureRasterObject(context, object, mutationToken)
      : object;
  if (!target || !context.isLayerMutationTokenCurrent(mutationToken)) {
    return;
  }

  switch (context.transformationId) {
    case 'flip-horizontal':
      target.set({ flipX: !target.flipX });
      break;
    case 'flip-vertical':
      target.set({ flipY: !target.flipY });
      break;
    case 'rotate-left':
      target.rotate((target.angle ?? 0) - 90);
      break;
    case 'rotate-right':
      target.rotate((target.angle ?? 0) + 90);
      break;
    case 'resize-layer':
      return;
  }

  target.setCoords();
  syncSourceFromObject(context, target);
  commitLayerMutation(context, context.canvas);
}
