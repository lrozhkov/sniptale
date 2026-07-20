import type { Canvas, FabricObject } from 'fabric';
import { getSourceObject } from '../../document/layers';
import { syncSourceStateFromObject } from '../../document/source';
import type { CropSelection } from '../../core/types';
import type { SourceState } from '../../../document/model/source-state';
import { isUserObject } from '../../../document/model';

export async function runEditorCropSelection(context: {
  canvas: Canvas;
  crop: CropSelection;
  rebuildFrameDecorations: () => Promise<void>;
  setCanvasDocumentSize: (size: { width: number; height: number }) => void;
  setSource: (source: SourceState | null) => void;
  source: SourceState | null;
  syncViewportTransform: () => void;
}): Promise<void> {
  const nextCanvasSize = {
    width: context.crop.width,
    height: context.crop.height,
  };
  shiftSceneObjectsForCrop(context.canvas, context.crop);
  context.setCanvasDocumentSize(nextCanvasSize);
  context.canvas.setDimensions(nextCanvasSize);
  context.setSource(createPostCropSourceState(context.canvas, context.source, context.crop));
  context.syncViewportTransform();
  await context.rebuildFrameDecorations();
}

function shiftSceneObjectsForCrop(canvas: Canvas, crop: CropSelection): void {
  canvas.getObjects().forEach((object) => {
    if (!isUserObject(object)) {
      return;
    }

    shiftObjectByCrop(object, crop);
  });
}

function shiftObjectByCrop(object: FabricObject, crop: CropSelection): void {
  object.set({
    left: (object.left ?? 0) - crop.left,
    top: (object.top ?? 0) - crop.top,
  });
  object.setCoords();
}

export function createPostCropSourceState(
  canvas: Canvas,
  source: SourceState | null,
  crop: CropSelection
): SourceState | null {
  const sourceObject = getSourceObject(canvas);
  if (sourceObject) {
    return syncSourceStateFromObject(source, sourceObject);
  }

  if (!source) {
    return null;
  }

  return {
    ...source,
    left: source.left - crop.left,
    top: source.top - crop.top,
  };
}
