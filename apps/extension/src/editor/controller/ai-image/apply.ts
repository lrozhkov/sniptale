import { FabricImage, config, util, type FabricObject, type TMat2D } from 'fabric';
import { imageRasterSchema, type ImageRaster } from '../../../contracts/ai/image';
import { getSourceObject } from '../document/layers';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { createRasterizedEditorImage } from '../layer-effects/rasterize/image-object';
import { imageResultCrop, uniformImageResultCrop } from './geometry';
import { imageObjectSignature, isImageSnapshotCurrent } from './snapshot';
import type { EditorImageSnapshot, ImageApplyController, ImageApplyReceipt } from './types';

export type ImageResultFitting = 'exact' | 'cover' | 'free';

/** Removes input padding and produces the same bitmap for preview and document application. */
export async function prepareImageEditorResult(
  snapshot: EditorImageSnapshot,
  raster: ImageRaster,
  fit = true,
  fitting: ImageResultFitting = 'exact'
): Promise<ImageRaster> {
  if (snapshot.intention === 'new-image') return raster;
  const local = snapshot.intention === 'region' || snapshot.intention === 'layers';
  const crop = local
    ? uniformImageResultCrop(snapshot.inputBounds, snapshot.targetBounds, raster)
    : imageResultCrop(snapshot.inputBounds, snapshot.targetBounds, raster, fit);
  const free = !local && fitting === 'free';
  const output = document.createElement('canvas');
  output.width = free ? Math.max(1, Math.round(crop.width)) : snapshot.targetBounds.width;
  output.height = free ? Math.max(1, Math.round(crop.height)) : snapshot.targetBounds.height;
  if (!local && fitting === 'cover') {
    const scale = Math.max(output.width / crop.width, output.height / crop.height);
    const width = output.width / scale;
    const height = output.height / scale;
    crop.left += (crop.width - width) / 2;
    crop.top += (crop.height - height) / 2;
    crop.width = width;
    crop.height = height;
  }
  if (
    crop.left === 0 &&
    crop.top === 0 &&
    crop.width === raster.width &&
    crop.height === raster.height &&
    output.width === raster.width &&
    output.height === raster.height &&
    (snapshot.intention !== 'region' || fit)
  ) {
    output.width = 0;
    output.height = 0;
    return raster;
  }
  const bitmap = await createImageBitmap(await dataUrlToBlob(raster.dataUrl));
  try {
    const context = output.getContext('2d');
    if (!context) throw new Error('apply-unavailable');
    context.drawImage(
      bitmap,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      output.width,
      output.height
    );
    // Strict native-pixel replacement cannot claim erasure through an alpha overlay.
    if (snapshot.intention === 'region' && !fit) {
      const pixels = context.getImageData(0, 0, output.width, output.height).data;
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i] !== 255) throw new Error('transparent-region');
    }
    return { dataUrl: output.toDataURL('image/png'), width: output.width, height: output.height };
  } finally {
    bitmap.close();
    output.width = 0;
    output.height = 0;
  }
}

/** Center-based Fabric transform shared by the canvas preview and the inserted layer. */
export function imageResultTransform(
  snapshot: EditorImageSnapshot,
  raster: Pick<ImageRaster, 'width' | 'height'>,
  fitting: ImageResultFitting = 'exact'
): TMat2D {
  const target = snapshot.targetBounds;
  const contain =
    (fitting === 'free' && snapshot.intention !== 'region' && snapshot.intention !== 'layers') ||
    snapshot.intention === 'new-image';
  const scale = contain
    ? Math.min(
        snapshot.intention === 'new-image' ? 1 : Infinity,
        target.width / raster.width,
        target.height / raster.height
      )
    : 1;
  if (snapshot.intention === 'source' && snapshot.sourceTransform)
    return util.multiplyTransformMatrices(snapshot.sourceTransform, [scale, 0, 0, scale, 0, 0]);
  return [scale, 0, 0, scale, target.left + target.width / 2, target.top + target.height / 2];
}

function positionImageResult(
  image: FabricImage,
  snapshot: EditorImageSnapshot,
  fitting: ImageResultFitting
) {
  util.applyTransformToObject(image, imageResultTransform(snapshot, image, fitting));
  // Match Fabric's saved transform before the first render.
  const precision = Math.max(0, Math.trunc(config.NUM_FRACTION_DIGITS));
  for (const key of ['left', 'top', 'scaleX', 'scaleY', 'angle', 'skewX', 'skewY'] as const)
    image.set(key, Number(image[key].toFixed(precision)));
}

/** Update is available only while the exact accepted object and bytes remain unchanged. */
export function canUpdateImageResult(
  controller: ImageApplyController,
  receipt: ImageApplyReceipt
): boolean {
  return Boolean(
    controller.canvas?.getObjects().includes(receipt.object) &&
    imageObjectSignature(receipt.object) === receipt.signature &&
    (receipt.sourceDataUrl === undefined || controller.source?.dataUrl === receipt.sourceDataUrl)
  );
}

/** Detects an accepted result after history rehydration. This does not authorize Update or Replace. */
export function isImageApplyResultPresent(
  controller: ImageApplyController,
  receipt: ImageApplyReceipt
): boolean {
  if (canUpdateImageResult(controller, receipt)) return true;
  return Boolean(
    receipt.objectId &&
    (receipt.sourceDataUrl === undefined || controller.source?.dataUrl === receipt.sourceDataUrl) &&
    controller.canvas
      ?.getObjects()
      .some(
        (object) =>
          object.sniptaleId === receipt.objectId &&
          imageObjectSignature(object) === receipt.signature
      )
  );
}

function assertImageApplyTarget(
  controller: ImageApplyController,
  snapshot: EditorImageSnapshot,
  mode: 'add' | 'replace' | 'update',
  previous: ImageApplyReceipt | undefined
): asserts controller is ImageApplyController & {
  canvas: NonNullable<ImageApplyController['canvas']>;
} {
  if (
    controller.canvas !== snapshot.canvas ||
    controller.originalDocument !== snapshot.originalDocument ||
    controller.source?.id !== snapshot.sourceId
  )
    throw new Error('stale-document');
  if (
    mode === 'replace' &&
    (!snapshot.replacementAllowed || !isImageSnapshotCurrent(controller, snapshot))
  )
    throw new Error('stale-source');
  if (mode === 'update' && (!previous || !canUpdateImageResult(controller, previous)))
    throw new Error('changed-result');
}

/** Applies a validated preview in one history commit after all asynchronous preparation succeeds. */
export async function applyImageEditorResult(options: {
  controller(): ImageApplyController;
  snapshot: EditorImageSnapshot;
  raster: ImageRaster;
  mode: 'add' | 'replace' | 'update';
  name: string;
  fit: boolean;
  fitting?: ImageResultFitting;
  previous?: ImageApplyReceipt;
  signal?: AbortSignal;
}): Promise<ImageApplyReceipt> {
  const { snapshot } = options;
  const raster = imageRasterSchema.parse(options.raster);
  options.signal?.throwIfAborted();
  const initial = options.controller();
  assertImageApplyTarget(initial, snapshot, options.mode, options.previous);
  const mainSource =
    (options.mode === 'replace' && snapshot.intention === 'source') ||
    (options.mode === 'update' && options.previous?.sourceDataUrl !== undefined);
  const fitting = mainSource && options.fitting === 'free' ? 'exact' : (options.fitting ?? 'exact');
  const prepared = await prepareImageEditorResult(snapshot, raster, options.fit, fitting);
  const image = await createRasterizedEditorImage({
    dataUrl: prepared.dataUrl,
    id: crypto.randomUUID(),
    name: options.name,
    left: snapshot.intention === 'new-image' ? 0 : snapshot.targetBounds.left,
    top: snapshot.intention === 'new-image' ? 0 : snapshot.targetBounds.top,
    role: 'annotation',
    type: 'image',
    visible: true,
    locked: false,
  });
  positionImageResult(image, snapshot, fitting);
  options.signal?.throwIfAborted();
  const controller = options.controller();
  assertImageApplyTarget(controller, snapshot, options.mode, options.previous);
  const canvas = controller.canvas;
  const sourceObject = mainSource ? getSourceObject(canvas) : undefined;
  if (
    mainSource &&
    (!(sourceObject instanceof FabricImage) || !controller.source || sourceObject.sniptaleLocked)
  )
    throw new Error('stale-source');
  const oldSource = controller.source;
  let resultObject: FabricObject = image;
  const oldOrder = [...canvas.getObjects()];
  const oldActive = canvas.getActiveObject();
  const oldVisibility = oldOrder.map((object) => ({ object, visible: object.visible }));
  const oldElement = sourceObject instanceof FabricImage ? sourceObject.getElement() : null;
  const oldDimensions = sourceObject
    ? { width: sourceObject.width, height: sourceObject.height }
    : null;
  try {
    controller.withHistoryMuted(() => {
      if (mainSource && sourceObject instanceof FabricImage && oldSource) {
        // Keep the unique source object, display geometry, effects and all overlay layers.
        const width = sourceObject.width,
          height = sourceObject.height;
        sourceObject.setElement(image.getElement());
        sourceObject.set({ width, height });
        sourceObject.setCoords();
        controller.setSource({
          ...oldSource,
          dataUrl: prepared.dataUrl,
          intrinsicWidth: prepared.width,
          intrinsicHeight: prepared.height,
        });
        resultObject = sourceObject;
      } else {
        controller.prepareObject(image);
        const previous = options.mode === 'update' ? options.previous?.object : undefined;
        const insertion = previous
          ? canvas.getObjects().indexOf(previous)
          : options.mode === 'replace'
            ? Math.max(
                ...snapshot.sources.map((binding) => canvas.getObjects().indexOf(binding.object))
              ) + 1
            : canvas.getObjects().length;
        if (previous) canvas.remove(previous);
        canvas.add(image);
        canvas.moveObjectTo(image, Math.min(insertion, canvas.getObjects().length - 1));
        if (options.mode === 'replace')
          snapshot.sources.forEach((binding) => binding.object.set({ visible: false }));
        canvas.setActiveObject(image);
      }
      controller.ensureBrowserFrameOnTop();
      canvas.requestRenderAll();
    });
    controller.commitHistory();
  } catch (error) {
    controller.withHistoryMuted(() => {
      canvas.remove(...canvas.getObjects().filter((object) => !oldOrder.includes(object)));
      oldOrder.forEach((object, index) => {
        if (!canvas.getObjects().includes(object)) canvas.add(object);
        canvas.moveObjectTo(object, index);
      });
      oldVisibility.forEach(({ object, visible }) => object.set({ visible }));
      if (sourceObject instanceof FabricImage && oldElement && oldDimensions) {
        sourceObject.setElement(oldElement);
        sourceObject.set(oldDimensions);
        sourceObject.setCoords();
      }
      controller.setSource(oldSource);
      if (oldActive) canvas.setActiveObject(oldActive);
      else canvas.discardActiveObject();
      canvas.requestRenderAll();
    });
    throw error;
  }
  controller.syncRuntimeState();
  return {
    object: resultObject,
    signature: imageObjectSignature(resultObject),
    ...(resultObject.sniptaleId ? { objectId: resultObject.sniptaleId } : {}),
    ...(mainSource ? { sourceDataUrl: prepared.dataUrl } : {}),
  };
}
