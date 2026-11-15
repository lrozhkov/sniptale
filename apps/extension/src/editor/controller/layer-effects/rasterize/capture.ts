import { Group, type Canvas, type FabricObject } from 'fabric';
import {
  IMAGE_JOB_LIMITS,
  imageRasterSchema,
  type ImageRaster,
} from '../../../../contracts/ai/image';
import { dataUrlToBlob } from '../../../../platform/media-utils/data-url';
import { createRuntimeMessagingTransport } from '../../../../platform/runtime-messaging';
import { collectFrameAnnotationProxies } from '../../../frame-annotation/proxy';
import { rasterizeFrameAnnotations } from '../../../../composition/frame-annotation-raster-client';
import { getEditorEditingDocumentSize } from '../../../document/canvas-surface/editing-surface';

type Bounds = { left: number; top: number; width: number; height: number };

function projectedRenderBounds(bounds: Bounds, size: { width: number; height: number }): Bounds {
  // Projection uses document coordinates and cannot preserve pixels outside its document surface.
  if (
    bounds.left < 0 ||
    bounds.top < 0 ||
    bounds.left + bounds.width > size.width ||
    bounds.top + bounds.height > size.height
  )
    throw new Error('unsupported-selection');
  return { left: 0, top: 0, ...size };
}

/** Copies frozen content into an output canvas at one image pixel per document pixel. */
export async function reframeEditorRaster(
  image: ImageRaster,
  from: Bounds,
  content: Bounds,
  output: Bounds,
  signal?: AbortSignal
): Promise<ImageRaster> {
  imageRasterSchema.parse(image);
  if (image.width !== from.width || image.height !== from.height) throw new Error('size-mismatch');
  if (
    from.left === output.left &&
    from.top === output.top &&
    from.width === output.width &&
    from.height === output.height
  )
    return image;
  if (output.width * output.height > IMAGE_JOB_LIMITS.maxImagePixels) throw new Error('too-large');
  const sx = content.left - from.left,
    sy = content.top - from.top;
  const dx = content.left - output.left,
    dy = content.top - output.top;
  if (
    sx < 0 ||
    sy < 0 ||
    dx < 0 ||
    dy < 0 ||
    sx + content.width > from.width ||
    sy + content.height > from.height ||
    dx + content.width > output.width ||
    dy + content.height > output.height
  )
    throw new Error('output-too-small');
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(await dataUrlToBlob(image.dataUrl, signal));
  try {
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('capture-unavailable');
    context.imageSmoothingEnabled = false;
    context.drawImage(
      bitmap,
      sx,
      sy,
      content.width,
      content.height,
      dx,
      dy,
      content.width,
      content.height
    );
    const raster = imageRasterSchema.parse({
      dataUrl: canvas.toDataURL('image/png'),
      width: output.width,
      height: output.height,
    });
    canvas.width = 0;
    canvas.height = 0;
    signal?.throwIfAborted();
    return raster;
  } finally {
    bitmap.close();
  }
}

function applySelectedVisibility(objects: FabricObject[], selected: ReadonlySet<string>) {
  const restore: Array<{
    object: FabricObject;
    visible: boolean;
    objectCaching: boolean;
    dirty: boolean;
  }> = [];
  function visit(object: FabricObject, inherited: boolean): boolean {
    const included = inherited || Boolean(object.sniptaleId && selected.has(object.sniptaleId));
    const children = object instanceof Group ? object.getObjects() : [];
    const childIncluded = children.map((child) => visit(child, included)).some(Boolean);
    restore.push({
      object,
      visible: object.visible,
      objectCaching: object.objectCaching,
      dirty: object.dirty,
    });
    object.visible = object.visible && (included || childIncluded);
    if (children.length) {
      object.objectCaching = false;
      object.dirty = true;
    }
    return included || childIncluded;
  }
  objects.forEach((object) => visit(object, false));
  return () =>
    restore.forEach((saved) => {
      saved.object.visible = saved.visible;
      saved.object.objectCaching = saved.objectCaching;
      saved.object.dirty = saved.dirty;
    });
}

function renderFrozenBase(
  canvas: Canvas,
  bounds: Bounds,
  selectedIds: readonly string[] | undefined
) {
  const output = document.createElement('canvas');
  output.width = bounds.width;
  output.height = bounds.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('capture-unavailable');
  const previous = {
    width: canvas.width,
    height: canvas.height,
    viewportTransform: canvas.viewportTransform,
    enableRetinaScaling: canvas.enableRetinaScaling,
    drawControls: canvas.drawControls,
    backgroundColor: canvas.backgroundColor,
    overlayColor: canvas.overlayColor,
    backgroundImage: canvas.backgroundImage,
    overlayImage: canvas.overlayImage,
  };
  const restore = selectedIds
    ? applySelectedVisibility(canvas.getObjects(), new Set(selectedIds))
    : () => {};
  try {
    const projections = collectFrameAnnotationProxies(canvas.getObjects());
    const proxies = new Set(projections.map((entry) => entry.object));
    canvas.width = output.width;
    canvas.height = output.height;
    canvas.viewportTransform = [1, 0, 0, 1, -bounds.left, -bounds.top];
    canvas.enableRetinaScaling = false;
    canvas.drawControls = () => {};
    if (selectedIds)
      canvas.set({
        backgroundColor: '',
        overlayColor: '',
        backgroundImage: undefined,
        overlayImage: undefined,
      });
    canvas.calcViewportBoundaries();
    canvas.renderCanvas(
      context,
      canvas
        .getObjects()
        .filter((object) => object.visible && !object.excludeFromExport && !proxies.has(object))
    );
    return {
      dataUrl: output.toDataURL('image/png'),
      snapshots: projections.map((entry) => entry.snapshot),
    };
  } finally {
    canvas.set(previous);
    restore();
    canvas.calcViewportBoundaries();
    output.width = 0;
    output.height = 0;
  }
}

/** Captures actual runtime pixels and delegates projected annotations to their canonical raster owner. */
export async function captureEditorRaster(
  canvas: Canvas,
  bounds: Bounds,
  selectedIds?: readonly string[],
  signal?: AbortSignal
): Promise<ImageRaster> {
  signal?.throwIfAborted();
  const hasProjected = collectFrameAnnotationProxies(canvas.getObjects()).length > 0;
  const size = getEditorEditingDocumentSize(canvas) ?? {
    width: canvas.width,
    height: canvas.height,
  };
  const renderBounds = hasProjected ? projectedRenderBounds(bounds, size) : bounds;
  if (renderBounds.width * renderBounds.height > IMAGE_JOB_LIMITS.maxImagePixels)
    throw new Error('too-large');
  const frozen = renderFrozenBase(canvas, renderBounds, selectedIds);
  if (frozen.snapshots.length === 0 && !hasProjected)
    return imageRasterSchema.parse({
      dataUrl: frozen.dataUrl,
      width: bounds.width,
      height: bounds.height,
    });
  let blob = await dataUrlToBlob(frozen.dataUrl);
  if (frozen.snapshots.length) {
    const projected = await rasterizeFrameAnnotations({
      transport: createRuntimeMessagingTransport(),
      input: {
        baseImage: blob,
        width: size.width,
        height: size.height,
        snapshots: frozen.snapshots,
      },
      ...(signal ? { signal } : {}),
      isCurrent: () => !signal?.aborted,
    });
    blob = projected.blob;
  }
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  try {
    const output = document.createElement('canvas');
    output.width = bounds.width;
    output.height = bounds.height;
    const context = output.getContext('2d');
    if (!context) throw new Error('capture-unavailable');
    context.drawImage(
      bitmap,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height
    );
    const result = imageRasterSchema.parse({
      dataUrl: output.toDataURL('image/png'),
      width: bounds.width,
      height: bounds.height,
    });
    output.width = 0;
    output.height = 0;
    signal?.throwIfAborted();
    return result;
  } finally {
    bitmap.close();
  }
}
