import type { Canvas, FabricObject } from 'fabric';
import { createRasterizedEditorImage, rasterizeEditorObjects } from './rasterize';
import {
  commitLayerMutation,
  moveObjectToIndex,
  syncSourceFromObject,
  type LayerMutationContext,
} from './mutation-shared';

function getMergedInsertionIndex(canvas: Canvas, objects: FabricObject[]): number {
  const indices = objects
    .map((object) => canvas.getObjects().indexOf(object))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  const maxIndex = indices.at(-1) ?? 0;

  return maxIndex - Math.max(0, indices.length - 1);
}

async function createMergedLayerImage(args: {
  renderData: NonNullable<ReturnType<typeof rasterizeEditorObjects>>;
  selectedObjects: FabricObject[];
  sourceObject: FabricObject | null;
  targetReference: FabricObject;
}) {
  const { renderData, selectedObjects, sourceObject, targetReference } = args;

  return createRasterizedEditorImage({
    dataUrl: renderData.dataUrl,
    id: targetReference.sniptaleId ?? crypto.randomUUID(),
    left: renderData.bounds.left,
    locked: Boolean(targetReference.sniptaleLocked),
    name: targetReference.sniptaleLabel ?? 'Merged layer',
    role: sourceObject ? 'source' : 'annotation',
    top: renderData.bounds.top,
    type: sourceObject ? 'source-image' : 'image',
    visible: selectedObjects.some((object) => object.visible !== false),
  });
}

export async function mergeEditorSelectedLayers(context: LayerMutationContext): Promise<void> {
  const { canvas } = context;
  if (!canvas) {
    return;
  }

  const selectedObjects = canvas
    .getActiveObjects()
    .filter((object): object is FabricObject => Boolean(object.sniptaleId));
  if (selectedObjects.length < 2) {
    return;
  }

  const renderData = rasterizeEditorObjects(canvas, selectedObjects);
  if (!renderData) {
    return;
  }

  const sourceObject =
    selectedObjects.find((object) => object.sniptaleType === 'source-image') ?? null;
  const targetReference = sourceObject ?? selectedObjects.at(-1) ?? null;
  if (!targetReference) {
    return;
  }

  const mutationToken = context.createLayerMutationToken();
  const mergedImage = await createMergedLayerImage({
    renderData,
    selectedObjects,
    sourceObject,
    targetReference,
  });
  if (!context.isLayerMutationTokenCurrent(mutationToken)) {
    return;
  }

  const insertionIndex = sourceObject
    ? canvas.getObjects().indexOf(sourceObject)
    : getMergedInsertionIndex(canvas, selectedObjects);
  context.prepareObject(mergedImage);
  selectedObjects.forEach((object) => canvas.remove(object));
  canvas.add(mergedImage);
  moveObjectToIndex(canvas, mergedImage, insertionIndex);
  if (sourceObject) {
    context.sendFrameObjectsToBack();
  }
  canvas.setActiveObject(mergedImage);
  syncSourceFromObject(context, mergedImage);
  commitLayerMutation(context, canvas);
}
