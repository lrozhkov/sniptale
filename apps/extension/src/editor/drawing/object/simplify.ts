import { FabricImage, Group, Point, Rect, util, type FabricObject, type ImageSource } from 'fabric';
import {
  getDrawingObjectSelectionBounds,
  type DrawingBounds,
  type DrawingSimplifyObject,
  type DrawingSimplifySource,
} from '../../../features/drawing/public';
import type { SimplifyRegion } from '../../../features/simplify/raster';
import {
  renderBackdropCanvas,
  type MutableBlurCanvas,
} from '../../objects/annotation/blur/backdrop/canvas';
import { createObjectLabel } from '../../document/model';
import { readEditorDrawingObject, writeEditorDrawingObject } from './metadata';

const geometryPreviews = new WeakSet<FabricObject>();

/** Keeps temporary geometry feedback outside accepted raster metadata. */
export function setEditorSimplifyGeometryPreview(object: FabricObject, enabled: boolean): void {
  if (enabled) geometryPreviews.add(object);
  else geometryPreviews.delete(object);
}

function isGeometryPreviewActive(raster: FabricObject, context: CanvasRenderingContext2D): boolean {
  const canvas = raster.canvas;
  if (!canvas || context !== canvas.getContext()) return false;
  const transform = canvas._currentTransform;
  return (
    geometryPreviews.has(raster) ||
    (transform?.target === raster &&
      typeof transform.action === 'string' &&
      /^(scale|resiz)/.test(transform.action))
  );
}

function paintGeometryPreview(
  raster: FabricObject,
  context: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement
): boolean {
  const canvas = raster.canvas;
  if (
    !canvas ||
    raster.width <= 0 ||
    raster.height <= 0 ||
    !isGeometryPreviewActive(raster, context)
  )
    return false;
  const objectIndex = canvas.getObjects().indexOf(raster);
  if (objectIndex < 0) return false;
  const matrix = raster.calcTransformMatrix();
  const width = Math.max(1, Math.ceil(raster.width * Math.hypot(matrix[0], matrix[1])));
  const height = Math.max(1, Math.ceil(raster.height * Math.hypot(matrix[2], matrix[3])));
  if (width * height > 16_777_216) return false;
  scratch.width = width;
  scratch.height = height;
  const capture = scratch.getContext('2d');
  if (!capture) return false;
  renderBackdropCanvas({
    backdropCanvas: scratch,
    bounds: {
      width,
      height,
      paddedWidth: width,
      paddedHeight: height,
      left: 0,
      top: 0,
      viewportTransform: util.multiplyTransformMatrices(
        [width / raster.width, 0, 0, height / raster.height, width / 2, height / 2],
        util.invertTransform(matrix)
      ),
    },
    canvas: canvas as MutableBlurCanvas,
    context: capture,
    objectIndex,
  });
  context.save();
  try {
    context.beginPath();
    context.rect(-raster.width / 2, -raster.height / 2, raster.width, raster.height);
    context.clip();
    context.filter = 'blur(2px)';
    context.drawImage(scratch, -raster.width / 2, -raster.height / 2, raster.width, raster.height);
  } finally {
    context.restore();
  }
  return true;
}

/** Maps a rotated automatic mask to one pixel-aligned source region. */
export function sampleEditorSimplifyRegion(
  drawing: DrawingSimplifyObject,
  source: DrawingSimplifySource
): { region: SimplifyRegion; bounds: DrawingBounds } {
  const bounds = drawing.settings.automatic
    ? getDrawingObjectSelectionBounds(drawing)
    : drawing.bounds;
  const scaleX = source.width / source.bounds.width;
  const scaleY = source.height / source.bounds.height;
  const x = Math.max(0, Math.floor((bounds.x - source.bounds.x) * scaleX));
  const y = Math.max(0, Math.floor((bounds.y - source.bounds.y) * scaleY));
  const right = Math.min(
    source.width,
    Math.ceil((bounds.x + bounds.width - source.bounds.x) * scaleX)
  );
  const bottom = Math.min(
    source.height,
    Math.ceil((bounds.y + bounds.height - source.bounds.y) * scaleY)
  );
  if (![x, y, right, bottom].every(Number.isFinite) || right <= x || bottom <= y)
    throw new Error('Simplify region is outside the source raster.');
  return {
    region: { x, y, width: right - x, height: bottom - y },
    bounds: {
      x: source.bounds.x + x / scaleX,
      y: source.bounds.y + y / scaleY,
      width: (right - x) / scaleX,
      height: (bottom - y) / scaleY,
    },
  };
}

/** Builds accepted raster geometry or an uncommitted region draft. */
export function createEditorDrawingSimplifyObject(
  drawing: DrawingSimplifyObject,
  labelIndex: number,
  element?: ImageSource
): FabricObject {
  const { bounds, result } = drawing;
  let object: FabricObject;
  if (result) {
    const image = element ?? document.createElement('img');
    if (image instanceof HTMLImageElement && !element) {
      image.onload = () => object.canvas?.requestRenderAll();
      image.src = result.dataUrl;
    }
    const raster = new FabricImage(image, {
      width: result.width,
      height: result.height,
      scaleX: bounds.width / result.width,
      scaleY: bounds.height / result.height,
      objectCaching: false,
    });

    object = raster;
  } else {
    object = new Rect({
      width: bounds.width,
      height: bounds.height,
      fill: 'rgba(37,99,235,0.08)',
      stroke: '#2563eb',
      strokeWidth: 1,
      strokeDashArray: [4, 3],
      strokeUniform: true,
    });
  }
  object.set({ originX: 'center', originY: 'center', angle: drawing.rotation ?? 0 });
  object.setPositionByOrigin(
    new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
    'center',
    'center'
  );
  object.sniptaleId = drawing.id;
  object.sniptaleType = 'simplify';
  object.sniptaleRole = 'annotation';
  object.sniptaleLabel = createObjectLabel('simplify', labelIndex);
  writeEditorDrawingObject(object, drawing);
  applyEditorDrawingSimplifyVisuals(object);
  return object;
}

/** Restores runtime-only raster paint after Fabric cloning or document admission. */
export function applyEditorDrawingSimplifyVisuals(object: FabricObject): void {
  if (object instanceof Group) {
    object.getObjects().forEach(applyEditorDrawingSimplifyVisuals);
    return;
  }
  const geometryTarget = object;
  const drawing = readEditorDrawingObject(object);
  if (drawing?.kind !== 'simplify') return;
  if (!drawing.result && object instanceof Rect) {
    const scratch = document.createElement('canvas');
    geometryPreviews.add(object);
    object._render = (context) => {
      paintGeometryPreview(object, context, scratch);
      Rect.prototype._render.call(object, context);
    };
    return;
  }
  if (!(object instanceof FabricImage) || !drawing.result) return;
  const raster = object;
  const image = raster.getElement();
  const result = drawing.result;
  const acceptedTransform = util.composeMatrix({
    translateX: drawing.bounds.x + drawing.bounds.width / 2,
    translateY: drawing.bounds.y + drawing.bounds.height / 2,
    angle: drawing.rotation ?? 0,
    scaleX: drawing.bounds.width / result.width,
    scaleY: drawing.bounds.height / result.height,
  });
  const scratch = document.createElement('canvas');
  const render = (context: CanvasRenderingContext2D) =>
    FabricImage.prototype._render.call(raster, context);
  raster._render = (context) => {
    if (image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0)) return;
    if (
      (drawing.settings.automatic || drawing.settings.manualKind === 'text') &&
      paintGeometryPreview(geometryTarget, context, scratch)
    )
      return;
    if (!drawing.settings.automatic) {
      if (
        drawing.settings.manualKind === 'image' &&
        isGeometryPreviewActive(geometryTarget, context)
      ) {
        context.drawImage(
          raster.getElement(),
          0,
          0,
          1,
          1,
          -raster.width / 2,
          -raster.height / 2,
          raster.width,
          raster.height
        );
        return;
      }
      render(context);
      return;
    }
    const region = drawing.source
      ? sampleEditorSimplifyRegion(drawing, drawing.source).bounds
      : getDrawingObjectSelectionBounds(drawing);
    context.save();
    try {
      context.beginPath();
      context.rect(-raster.width / 2, -raster.height / 2, raster.width, raster.height);
      context.clip();
      // Accepted pixels keep scene orientation; live gestures and parent groups transport that accepted image.
      context.transform(...util.invertTransform(acceptedTransform));
      context.drawImage(
        raster.getElement(),
        0,
        0,
        result.width,
        result.height,
        region.x,
        region.y,
        region.width,
        region.height
      );
    } finally {
      context.restore();
    }
  };
}
