import { ActiveSelection, Group, config, type FabricObject } from 'fabric';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { imageRasterSchema, type ImageRaster } from '../../../contracts/ai/image';
import { CUSTOM_JSON_PROPS, isSourceObject, isUserObject } from '../../document/model';
import { getSourceObject } from '../document/layers';
import { captureEditorRaster, reframeEditorRaster } from '../layer-effects/rasterize/capture';
import { integerImageBounds, imageContextBounds, padImageBounds } from './geometry';
import type {
  EditorImageSnapshot,
  ImageApplyController,
  ImageBounds,
  ImageCaptureContext,
  ImageIntention,
} from './types';

/** Includes world geometry so that group or active-selection transforms invalidate replacement. */
export function imageObjectSignature(object: FabricObject): string {
  const serialized: unknown = object.toObject([...CUSTOM_JSON_PROPS]);
  if (!isRecord(serialized)) throw new Error('unsupported-selection');
  // ActiveSelection changes local transform fields when selection changes, without editing pixels.
  const {
    left,
    top,
    scaleX,
    scaleY,
    angle,
    flipX,
    flipY,
    skewX,
    skewY,
    originX,
    originY,
    ...appearance
  } = serialized;
  void [left, top, scaleX, scaleY, angle, flipX, flipY, skewX, skewY, originX, originY];
  const matrix = object
    .calcTransformMatrix()
    .map((value) => Math.round(value * 1_000_000) / 1_000_000);
  return JSON.stringify({ object: appearance, matrix });
}

function persistentParent(object: FabricObject) {
  return object.parent ?? (object.group instanceof ActiveSelection ? undefined : object.group);
}

function normalizeSelection(objects: FabricObject[]): FabricObject[] {
  const chosen = new Set(objects);
  return objects.filter((object) => {
    for (let parent = persistentParent(object); parent; parent = persistentParent(parent))
      if (chosen.has(parent)) return false;
    return true;
  });
}

function visibleToUser(object: FabricObject): boolean {
  for (let current: FabricObject | undefined = object; current; current = persistentParent(current))
    if (!current.visible) return false;
  return true;
}

function unionImageBounds(boxes: ImageBounds[]): ImageBounds {
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  return {
    left,
    top,
    width: Math.max(...boxes.map((box) => box.left + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.top + box.height)) - top,
  };
}

function includeImageShadow(bounds: ImageBounds, object: FabricObject): ImageBounds {
  const shadow = object.shadow;
  if (!shadow) return bounds;
  const scale = shadow.nonScaling ? { x: 1, y: 1 } : object.getObjectScaling();
  // Match Fabric's native render scale. Three blur widths plus two pixels retain the blur tail.
  const blur = Math.abs((shadow.blur * config.browserShadowBlurConstant * (scale.x + scale.y)) / 2);
  const margin = Math.ceil(3 * blur) + 2;
  const x = shadow.offsetX * scale.x;
  const y = shadow.offsetY * scale.y;
  return unionImageBounds([
    bounds,
    {
      left: bounds.left + x - margin,
      top: bounds.top + y - margin,
      width: bounds.width + 2 * margin,
      height: bounds.height + 2 * margin,
    },
  ]);
}

function layerImageBounds(object: FabricObject): ImageBounds {
  const children =
    object instanceof Group ? object.getObjects().filter((child) => child.visible) : [];
  const bounds = unionImageBounds([object.getBoundingRect(), ...children.map(layerImageBounds)]);
  return includeImageShadow(bounds, object);
}

function selectedImageBounds(object: FabricObject): ImageBounds {
  let bounds = layerImageBounds(object);
  for (let parent = persistentParent(object); parent; parent = persistentParent(parent))
    bounds = includeImageShadow(bounds, parent);
  return bounds;
}

function replacementAllowed(objects: FabricObject[], order: FabricObject[]): boolean {
  if (
    !objects.length ||
    objects.some(
      (object) =>
        persistentParent(object) ||
        object.sniptaleLocked ||
        object.clipPath ||
        object.globalCompositeOperation !== 'source-over' ||
        isSourceObject(object)
    )
  )
    return false;
  const indices = objects.map((object) => order.indexOf(object)).sort((a, b) => a - b);
  return (
    indices[0] !== undefined &&
    indices[0] >= 0 &&
    indices.every((index, i) => index === indices[0]! + i)
  );
}

/** Rechecks identity as well as content; deleting and recreating an ID grants no stale Apply authority. */
export function isImageSnapshotCurrent(
  controller: ImageApplyController,
  snapshot: EditorImageSnapshot
): boolean {
  if (
    controller.canvas !== snapshot.canvas ||
    controller.originalDocument !== snapshot.originalDocument ||
    controller.source?.id !== snapshot.sourceId ||
    controller.source.dataUrl !== snapshot.sourceDataUrl
  )
    return false;
  const all: FabricObject[] = [];
  const visit = (object: FabricObject) => {
    all.push(object);
    if (object instanceof Group) object.getObjects().forEach(visit);
  };
  controller.canvas.getObjects().forEach(visit);
  return (
    snapshot.sources.every(
      (binding) =>
        all.includes(binding.object) &&
        persistentParent(binding.object) === binding.parent &&
        imageObjectSignature(binding.object) === binding.signature
    ) &&
    (snapshot.intention === 'source' ||
      snapshot.intention === 'new-image' ||
      (snapshot.order.length === controller.canvas.getObjects().length &&
        snapshot.order.every((object, i) => controller.canvas?.getObjects()[i] === object)))
  );
}

/** Freezes the selected source before any asynchronous projection or provider preparation. */
export async function captureImageEditorSnapshot(
  controller: ImageApplyController,
  options: {
    intention: ImageIntention;
    region?: ImageBounds;
    context?: ImageCaptureContext;
    regionSource?: 'canvas' | 'source';
    signal?: AbortSignal;
  }
): Promise<EditorImageSnapshot> {
  const { canvas, source } = controller;
  if (!canvas || !source) throw new Error('source-unavailable');
  options.signal?.throwIfAborted();
  const order = [...canvas.getObjects()];
  const documentBounds = { left: 0, top: 0, ...controller.canvasDocumentSize };
  const selected =
    options.intention === 'new-image'
      ? []
      : options.intention === 'layers'
        ? normalizeSelection(canvas.getActiveObjects())
        : options.intention === 'source' || options.regionSource === 'source'
          ? [getSourceObject(canvas)].filter((object): object is FabricObject => Boolean(object))
          : order.filter((object) => object.visible && !object.excludeFromExport);
  if (
    options.intention === 'layers' &&
    (!selected.length ||
      selected.some(
        (object) =>
          !object.sniptaleId ||
          !isUserObject(object) ||
          isSourceObject(object) ||
          !visibleToUser(object)
      ))
  )
    throw new Error('unsupported-selection');
  let targetBounds: ImageBounds = documentBounds;
  if (options.intention === 'region') {
    if (!options.region) throw new Error('choose-region');
    targetBounds = integerImageBounds(options.region);
    if (
      targetBounds.left < 0 ||
      targetBounds.top < 0 ||
      targetBounds.left + targetBounds.width > documentBounds.width ||
      targetBounds.top + targetBounds.height > documentBounds.height
    )
      throw new Error('invalid-region');
  } else if (options.intention === 'layers') {
    targetBounds = integerImageBounds(unionImageBounds(selected.map(selectedImageBounds)));
  } else if (options.intention === 'source')
    targetBounds = {
      left: 0,
      top: 0,
      width: source.intrinsicWidth,
      height: source.intrinsicHeight,
    };
  const inputBounds =
    options.intention === 'region'
      ? imageContextBounds(targetBounds, documentBounds, options.context ?? 'surroundings')
      : targetBounds;
  const snapshot: EditorImageSnapshot = {
    id: crypto.randomUUID(),
    intention: options.intention,
    canvas,
    sourceId: source.id,
    sourceTransform:
      options.intention === 'source'
        ? (getSourceObject(canvas)?.calcTransformMatrix() ?? null)
        : null,
    sourceDataUrl: source.dataUrl,
    originalDocument: controller.originalDocument,
    order,
    sources: selected.map((object) => ({
      object,
      signature: imageObjectSignature(object),
      parent: persistentParent(object),
    })),
    names: selected.map((object) => object.sniptaleLabel ?? object.sniptaleId ?? ''),
    raster: null,
    captureRaster: null,
    captureBounds: inputBounds,
    contextMode: options.context ?? 'surroundings',
    regionSource: options.regionSource ?? 'canvas',
    inputBounds,
    targetBounds,
    replacementAllowed:
      options.intention === 'source'
        ? Boolean(selected[0] && !selected[0].sniptaleLocked)
        : replacementAllowed(selected, order),
  };
  if (options.intention === 'new-image') return snapshot;
  if (options.intention === 'source')
    snapshot.raster = imageRasterSchema.parse({
      dataUrl: source.dataUrl,
      width: source.intrinsicWidth,
      height: source.intrinsicHeight,
    });
  else
    snapshot.raster = await captureEditorRaster(
      canvas,
      inputBounds,
      options.intention === 'layers' || options.regionSource === 'source'
        ? selected.flatMap((object) => (object.sniptaleId ? [object.sniptaleId] : []))
        : undefined,
      options.signal
    );
  options.signal?.throwIfAborted();
  snapshot.captureRaster = snapshot.raster;
  return snapshot;
}

/** Reframes the retained input or an explicit variant without reading the live selection again. */
export async function prepareImageEditorSnapshot(
  snapshot: EditorImageSnapshot,
  size: { width: number; height: number } | null,
  variant?: { image: ImageRaster; inputBounds: ImageBounds },
  signal?: AbortSignal
): Promise<EditorImageSnapshot> {
  if (snapshot.intention === 'new-image') return { ...snapshot, raster: variant?.image ?? null };
  const image = variant?.image ?? snapshot.captureRaster;
  if (!image) throw new Error('source-unavailable');
  if (!size)
    return {
      ...snapshot,
      raster: image,
      inputBounds: variant?.inputBounds ?? snapshot.captureBounds,
    };
  const inputBounds = padImageBounds(snapshot.captureBounds, size);
  const raster = await reframeEditorRaster(
    image,
    variant?.inputBounds ?? snapshot.captureBounds,
    snapshot.captureBounds,
    inputBounds,
    signal
  );
  return { ...snapshot, inputBounds, raster };
}
