import { FabricImage, type Canvas, type FabricObject } from 'fabric';
import { createObjectLabel } from '../../document/model';
import { createInsertedImageObject } from '../tools/insertions';
import type { SourceState } from '../../document/model/source-state';

interface RasterClipboardInsertController {
  canvas: Canvas | null;
  source: SourceState | null;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: 'image') => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}

export interface RasterClipboardSceneBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function commitInsertedImage(
  controller: RasterClipboardInsertController,
  image: FabricObject
): void {
  controller.canvas?.add(image);
  controller.canvas?.setActiveObject(image);
  controller.canvas?.requestRenderAll();
  controller.commitHistory();
  controller.syncRuntimeState();
}

export async function insertClipboardImageAtSceneBounds(
  controller: RasterClipboardInsertController,
  dataUrl: string,
  sceneBounds: RasterClipboardSceneBounds
): Promise<void> {
  if (!controller.canvas) {
    return;
  }

  const image = await FabricImage.fromURL(dataUrl);
  image.set({
    left: sceneBounds.left,
    top: sceneBounds.top,
    originX: 'left',
    originY: 'top',
    scaleX: sceneBounds.width / Math.max(1, image.width ?? sceneBounds.width),
    scaleY: sceneBounds.height / Math.max(1, image.height ?? sceneBounds.height),
  });
  image.sniptaleId = crypto.randomUUID();
  image.sniptaleType = 'image';
  image.sniptaleRole = 'annotation';
  image.sniptaleLabel = createObjectLabel('image', controller.nextLabelIndex('image'));
  controller.prepareObject(image);
  commitInsertedImage(controller, image);
}

export async function insertExternalClipboardImage(
  controller: RasterClipboardInsertController,
  dataUrl: string
): Promise<void> {
  if (!controller.canvas || !controller.source) {
    return;
  }

  const image = await createInsertedImageObject({
    canvasHeight: controller.canvas.getHeight(),
    canvasWidth: controller.canvas.getWidth(),
    dataUrl,
    name: null,
    nextLabelIndex: controller.nextLabelIndex('image'),
    prepareObject: controller.prepareObject,
    source: controller.source,
  });
  commitInsertedImage(controller, image);
}
