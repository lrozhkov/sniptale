import type { Canvas, FabricObject } from 'fabric';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { normalizeEditorImageSettings } from '../../../features/editor/document/constants';
import { applyImageSettings } from '../../objects/image-style';
import { isFrameObject } from '../../document/model';
import type { PreparedEditorFrameDecorations } from './frame-decoration-types';
import { getSourceObject } from '../document/layers';

function replaceDecorationObjects(args: { canvas: Canvas; frameObjects: FabricObject[] }) {
  const decorationObjects = args.canvas.getObjects().filter((object) => isFrameObject(object));
  decorationObjects.forEach((object) => args.canvas.remove(object));

  args.frameObjects.forEach((object) => {
    object.sniptaleRole = 'frame';
    args.canvas.add(object);
    args.canvas.sendObjectToBack(object);
  });
}

function applySourceClipPath(canvas: Canvas, clipPath: FabricObject | null): void {
  const sourceObject = getSourceObject(canvas);
  if (!sourceObject) {
    return;
  }

  if (clipPath) {
    sourceObject.clipPath = clipPath;
  } else {
    delete sourceObject.clipPath;
  }
  sourceObject.dirty = true;
  sourceObject.setCoords();
}

function applySourceImageStyle(canvas: Canvas, frame: EditorFrameSettings): void {
  const sourceObject = getSourceObject(canvas);
  if (!sourceObject) {
    return;
  }

  applyImageSettings(sourceObject, normalizeEditorImageSettings(frame.sourceImage));
}

export function applyEditorFrameDecorations(options: {
  canvas: Canvas | null;
  frame: EditorFrameSettings;
  prepared: PreparedEditorFrameDecorations;
}): boolean {
  if (!options.canvas) {
    return false;
  }

  replaceDecorationObjects({
    canvas: options.canvas,
    frameObjects: options.prepared.frameObjects,
  });
  applySourceClipPath(options.canvas, options.prepared.browserFrameObjects.sourceClipPath);
  applySourceImageStyle(options.canvas, options.frame);
  return true;
}
