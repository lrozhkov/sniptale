import type { FabricObject } from 'fabric';
import { findObjectById } from '../../document/layers';
import type { EditorRasterMutationContext, EditorRasterTargetReference } from '../types';
import { createReplacementImage } from './image';
import { getRasterReplacementType } from './type';

export async function applyRasterBitmapToTarget(args: {
  context: EditorRasterMutationContext;
  reference: EditorRasterTargetReference;
  bitmap: HTMLCanvasElement;
}): Promise<FabricObject | null> {
  const object = findObjectById(args.context.canvas, args.reference.objectId);
  if (!object) {
    return null;
  }

  return await replaceSingleObjectWithRaster(args.context, object, args.bitmap);
}

async function replaceSingleObjectWithRaster(
  context: EditorRasterMutationContext,
  object: FabricObject,
  bitmap: HTMLCanvasElement
): Promise<FabricObject | null> {
  const canvas = context.canvas;
  if (!canvas) {
    return null;
  }

  const mutationToken = context.createLayerMutationToken();
  const replacement = await createReplacementImage(
    bitmap,
    object,
    getRasterReplacementType(object)
  );
  if (!context.isLayerMutationTokenCurrent(mutationToken)) {
    return null;
  }

  const index = canvas.getObjects().indexOf(object);
  context.prepareObject(replacement);
  canvas.remove(object);
  canvas.add(replacement);
  canvas.moveObjectTo(replacement, index);
  canvas.setActiveObject(replacement);
  if (replacement.sniptaleType === 'source-image') {
    context.sendFrameObjectsToBack();
  }
  context.setSourceFromObject(replacement);
  canvas.requestRenderAll();
  context.commitHistory();
  context.syncRuntimeState();
  return replacement;
}
