import type { FabricObject } from 'fabric';
import { isBlurObject } from '../../objects/annotation/blur/object';
import { loadRasterCanvasFromDataUrl } from './bitmap';
import type { EditorRasterResolvedTarget, EditorRasterTargetSnapshot } from './types';

export async function createRasterTargetSnapshot(
  target: EditorRasterResolvedTarget
): Promise<EditorRasterTargetSnapshot> {
  return {
    reference: target.reference,
    bitmap: await createRasterTargetBitmap(target.object),
    sceneBounds: target.object.getBoundingRect(),
  };
}

async function createRasterTargetBitmap(object: FabricObject): Promise<HTMLCanvasElement> {
  if (isBlurObject(object)) {
    return await loadRasterCanvasFromDataUrl(object.toDataURL({ format: 'png' }));
  }

  return object.toCanvasElement({ withoutTransform: true });
}
