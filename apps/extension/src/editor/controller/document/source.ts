import { FabricImage, type Canvas, type FabricObject } from 'fabric';
import { translate } from '../../../platform/i18n';
import { logEditorSourceTrace } from '../core/debug';
import type { SourceState } from '../../document/model/source-state';
import { getSourceObject } from './layers';
import { getFabricImageIntrinsicSize, isSourceObject } from '../../document/model';

export function syncSourceStateFromObject(
  source: SourceState | null,
  object?: FabricObject | null
): SourceState | null {
  if (!source || !object || !isSourceObject(object)) {
    return source;
  }

  return {
    ...source,
    id: object.sniptaleId ?? source.id,
    left: object.left ?? source.left,
    top: object.top ?? source.top,
    displayWidth: object.getScaledWidth(),
    displayHeight: object.getScaledHeight(),
    visible: object.visible !== false,
    locked: Boolean(object.sniptaleLocked),
  };
}

function logExistingSourceObject(existing: FabricObject) {
  logEditorSourceTrace('ensure:existing', {
    objectId: existing.sniptaleId,
    width: existing.getScaledWidth(),
    height: existing.getScaledHeight(),
  });
}

async function createEditorSourceImage(source: SourceState): Promise<FabricImage> {
  logEditorSourceTrace('ensure:start', {
    displayWidth: source.displayWidth,
    displayHeight: source.displayHeight,
    left: source.left,
    top: source.top,
  });

  const image = await FabricImage.fromURL(source.dataUrl);
  const intrinsicSize = getFabricImageIntrinsicSize(image);
  logEditorSourceTrace('image:loaded', {
    intrinsicWidth: intrinsicSize.width,
    intrinsicHeight: intrinsicSize.height,
  });

  image.set({
    left: source.left,
    top: source.top,
    originX: 'left',
    originY: 'top',
    scaleX: source.displayWidth / intrinsicSize.width,
    scaleY: source.displayHeight / intrinsicSize.height,
    visible: source.visible,
  });
  image.sniptaleId = source.id;
  image.sniptaleType = 'source-image';
  image.sniptaleRole = 'source';
  image.sniptaleLocked = source.locked;
  image.sniptaleLabel = source.name || translate('editor.runtime.sourceImage');

  return image;
}

function addSourceImageToCanvas(args: {
  canvas: Canvas;
  image: FabricImage;
  prepareObject: (object: FabricObject) => void;
}) {
  args.prepareObject(args.image);
  args.canvas.add(args.image);
  args.canvas.sendObjectToBack(args.image);
  logEditorSourceTrace('image:added', {
    canvasObjects: args.canvas.getObjects().length,
    objectId: args.image.sniptaleId,
    scaleX: args.image.scaleX,
    scaleY: args.image.scaleY,
    visible: args.image.visible !== false,
  });
}

export async function ensureEditorSourceLayer(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  prepareObject: (object: FabricObject) => void;
}): Promise<SourceState | null> {
  const { canvas, source, prepareObject } = options;
  if (!canvas || !source) {
    logEditorSourceTrace('ensure:skipped', {
      hasCanvas: Boolean(canvas),
      hasSource: Boolean(source),
    });
    return source;
  }

  const existing = getSourceObject(canvas);
  if (existing) {
    logExistingSourceObject(existing);
    return syncSourceStateFromObject(source, existing);
  }

  const image = await createEditorSourceImage(source);
  addSourceImageToCanvas({ canvas, image, prepareObject });
  return syncSourceStateFromObject(source, image);
}
