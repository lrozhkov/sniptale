import { FabricImage, Point, util, type Canvas, type FabricObject, type TMat2D } from 'fabric';
import { applyEditorRasterEffects } from '../controller/layer-effects/raster-effects';
import type { RasterTarget, RasterTargetAdapter } from './adapters';
import type { RasterBrushPreview } from './brush';
import type { PixelBounds } from './contracts';
import { composeRasterPixels, type RasterPixelData } from './pixels';

/** A prepared display resource. Disposal never changes the accepted target. */
interface PreparedRasterPreview {
  object: FabricObject;
  dispose(): void;
}
export interface RasterPreviewOptions {
  adapter?: Pick<RasterTargetAdapter, 'preparePreview' | 'isCurrent'>;
  onError?: (error: unknown) => void;
}
function isImage(object: FabricObject): object is FabricImage {
  return object instanceof FabricImage;
}
function dirtyAncestors(object: FabricObject) {
  object.dirty = true;
  let parent = object.group;
  while (parent) {
    parent.dirty = true;
    parent = parent.group;
  }
}
function positionPreview(image: FabricImage, target: RasterTarget, bounds: PixelBounds) {
  const source = target.geometry.sourceToScene;
  const matrix: TMat2D = [source[0], source[1], source[2], source[3], source[4], source[5]];
  const center = util.transformPoint(
    new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
    matrix
  );
  matrix[4] = center.x;
  matrix[5] = center.y;
  const relative = target.identity.group
    ? util.multiplyTransformMatrices(
        util.invertTransform(target.identity.group.calcTransformMatrix()),
        matrix
      )
    : matrix;
  util.applyTransformToObject(image, relative);
  image.set({ cropX: bounds.x, cropY: bounds.y, width: bounds.width, height: bounds.height });
  image.setCoords();
}
function createBitmap(canvas: Canvas, before: RasterPixelData): HTMLCanvasElement {
  const bitmap = canvas.getElement().ownerDocument.createElement('canvas');
  bitmap.width = before.width;
  bitmap.height = before.height;
  const context = bitmap.getContext('2d');
  if (!context) throw new Error('Raster preview context is unavailable');
  const data = context.createImageData(before.width, before.height);
  data.data.set(composeRasterPixels(before));
  context.putImageData(data, 0, 0);
  return bitmap;
}
function patchBitmap(bitmap: HTMLCanvasElement, draft: RasterBrushPreview): boolean {
  if (!draft.dirtyBounds || !draft.pixels) return false;
  const context = bitmap.getContext('2d');
  if (!context) return false;
  const bounds = draft.dirtyBounds,
    data = context.createImageData(bounds.width, bounds.height);
  data.data.set(draft.pixels);
  context.putImageData(data, bounds.x, bounds.y);
  return true;
}
/** Own native interception, draft resources and cancellation for one Canvas. Other render contexts use accepted pixels. */
export function createRasterPreview(canvas: Canvas, options: RasterPreviewOptions = {}) {
  let binding: {
    target: RasterTarget;
    value: PreparedRasterPreview;
    render: FabricObject['render'];
  } | null = null;
  let source: { target: RasterTarget; bitmap: HTMLCanvasElement } | null = null;
  let native = false,
    disposed = false,
    sequence = 0,
    abort: AbortController | null = null;
  const originalCanvasRender = canvas.renderCanvas;
  canvas.renderCanvas = function (context, objects) {
    native = context === canvas.getContext();
    const flags: Array<readonly [FabricObject, boolean]> = [];
    if (binding) {
      dirtyAncestors(binding.target.identity);
      let ancestor = native ? binding.target.identity.group : undefined;
      while (ancestor) {
        flags.push([ancestor, ancestor.objectCaching]);
        ancestor.objectCaching = false;
        ancestor = ancestor.group;
      }
    }
    try {
      return originalCanvasRender.call(this, context, objects);
    } finally {
      for (const [object, value] of flags) {
        object.objectCaching = value;
        object.dirty = true;
      }
      native = false;
    }
  };
  function clear() {
    sequence++;
    abort?.abort();
    abort = null;
    if (binding) {
      binding.target.identity.render = binding.render;
      dirtyAncestors(binding.target.identity);
      delete binding.value.object.group;
      binding.value.dispose();
      binding = null;
    }
    source = null;
    canvas.requestRenderAll();
  }
  function install(target: RasterTarget, value: PreparedRasterPreview) {
    if (disposed) {
      value.dispose();
      return;
    }
    clear();
    const accepted = target.identity,
      render = accepted.render;
    binding = { target, value, render };
    if (accepted.group) value.object.group = accepted.group;
    else delete value.object.group;
    value.object.canvas = canvas;
    accepted.render = function (context) {
      if (native) value.object.render(context);
      else render.call(this, context);
    };
    dirtyAncestors(accepted);
    canvas.requestRenderAll();
  }
  function ensureBitmap(target: RasterTarget, before: RasterPixelData): HTMLCanvasElement {
    if (source?.target === target) return source.bitmap;
    const bitmap = createBitmap(canvas, before);
    if (target.kind === 'background' && options.adapter) {
      clear();
      source = { target, bitmap };
      return bitmap;
    }
    const image = new FabricImage(bitmap, {
      objectCaching: false,
      selectable: false,
      evented: false,
    });
    positionPreview(image, target, target.geometry.crop);
    install(target, { object: image, dispose: () => image.dispose() });
    source = { target, bitmap };
    return bitmap;
  }
  function prepareBackground(target: RasterTarget, bitmap: HTMLCanvasElement) {
    const adapter = options.adapter;
    if (!adapter) return;
    const revision = ++sequence;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    void adapter.preparePreview(target, bitmap.toDataURL('image/png'), signal).then(
      (value) => {
        if (!value) return;
        if (
          disposed ||
          signal.aborted ||
          revision !== sequence ||
          source?.target !== target ||
          !adapter.isCurrent(target)
        ) {
          value.dispose();
          return;
        }
        install(target, value);
        source = { target, bitmap };
      },
      (error) => {
        if (!signal.aborted && revision === sequence) options.onError?.(error);
      }
    );
  }
  return {
    install,
    clear,
    pixels(target: RasterTarget, before: RasterPixelData, draft: RasterBrushPreview) {
      if (disposed) return;
      const bitmap = ensureBitmap(target, before);
      if (!patchBitmap(bitmap, draft)) return;
      if (target.kind === 'background' && options.adapter) {
        prepareBackground(target, bitmap);
        return;
      }
      if (!binding || !isImage(binding.value.object)) return;
      const image = binding.value.object,
        crop = target.geometry.crop;
      image.setElement(bitmap, { width: crop.width, height: crop.height });
      image.set({ cropX: crop.x, cropY: crop.y });
      applyEditorRasterEffects(image, [...(target.identity.sniptaleEffects ?? [])]);
      dirtyAncestors(target.identity);
      canvas.requestRenderAll();
    },
    expandSource(target: RasterTarget) {
      if (
        binding?.target !== target ||
        !isImage(binding.value.object) ||
        target.kind === 'background'
      )
        return;
      positionPreview(binding.value.object, target, {
        x: 0,
        y: 0,
        width: target.geometry.width,
        height: target.geometry.height,
      });
      dirtyAncestors(target.identity);
      canvas.requestRenderAll();
    },
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      canvas.renderCanvas = originalCanvasRender;
    },
  };
}
