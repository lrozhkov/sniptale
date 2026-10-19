import {
  getDrawingObjectBounds,
  getDrawingObjectRotation,
  resolveDrawingTextFontFamily,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import { renderDrawingObject } from './render';

export type ContentDrawingCaptureSnapshot = {
  objects: readonly DrawingObject[];
  projection: DrawingPoint;
  viewport: { width: number; height: number };
};

function loadCaptureImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Drawing capture image could not be decoded'));
    image.src = dataUrl;
  });
}

function requireCaptureContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Drawing capture canvas is unavailable');
  return context;
}

function drawCaptureBlur(
  context: CanvasRenderingContext2D,
  backdrop: HTMLImageElement,
  object: Extract<DrawingObject, { kind: 'blur' }>,
  snapshot: ContentDrawingCaptureSnapshot,
  scaleX: number
): void {
  const blurred = document.createElement('canvas');
  blurred.width = backdrop.naturalWidth;
  blurred.height = Math.max(1, Math.round(snapshot.viewport.height * scaleX));
  const blurredContext = requireCaptureContext(blurred);
  if (!('filter' in blurredContext)) throw new Error('Drawing capture blur is unavailable');
  const amount = object.amount ?? 10;
  const filter = `blur(${amount * scaleX}px)`;
  blurredContext.filter = filter;
  if (blurredContext.filter !== filter) throw new Error('Drawing capture blur is unavailable');
  blurredContext.drawImage(backdrop, 0, 0, blurred.width, blurred.height);
  const bounds = getDrawingObjectBounds(object);
  const centerX = bounds.x + bounds.width / 2 - snapshot.projection.x;
  const centerY = bounds.y + bounds.height / 2 - snapshot.projection.y;
  context.save();
  context.translate(centerX, centerY);
  context.rotate((getDrawingObjectRotation(object) * Math.PI) / 180);
  context.beginPath();
  context.rect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
  context.clip();
  context.rotate((-getDrawingObjectRotation(object) * Math.PI) / 180);
  context.translate(-centerX, -centerY);
  context.drawImage(blurred, 0, 0, snapshot.viewport.width, snapshot.viewport.height);
  context.restore();
}

export async function compositeContentDrawingCapture(
  dataUrl: string,
  snapshot: ContentDrawingCaptureSnapshot
): Promise<string> {
  if (snapshot.objects.length === 0) return dataUrl;
  if (
    !Number.isFinite(snapshot.viewport.width) ||
    !Number.isFinite(snapshot.viewport.height) ||
    snapshot.viewport.width <= 0 ||
    snapshot.viewport.height <= 0
  ) {
    throw new Error('Drawing capture viewport is invalid');
  }
  const image = await loadCaptureImage(dataUrl);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error('Drawing capture image has invalid dimensions');
  }
  if (document.fonts) {
    await Promise.all(
      snapshot.objects.flatMap((object) =>
        object.kind === 'text'
          ? [
              document.fonts.load(
                `${object.fontSize}px ${resolveDrawingTextFontFamily(object.fontFamily)}`,
                object.text
              ),
            ]
          : []
      )
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = requireCaptureContext(canvas);
  context.drawImage(image, 0, 0);
  const scaleX = canvas.width / snapshot.viewport.width;
  const scaleY = canvas.height / snapshot.viewport.height;
  context.scale(scaleX, scaleY);
  for (const object of snapshot.objects) {
    if (object.kind === 'blur') drawCaptureBlur(context, image, object, snapshot, scaleX);
  }
  for (const object of snapshot.objects) {
    if (object.kind === 'text') renderDrawingObject(context, object, snapshot.projection);
  }
  for (const object of snapshot.objects) {
    if (object.kind !== 'blur' && object.kind !== 'text') {
      renderDrawingObject(context, object, snapshot.projection);
    }
  }
  const result = canvas.toDataURL('image/png');
  if (result === 'data:,') throw new Error('Drawing capture image could not be encoded');
  return result;
}
