import type { Canvas, FabricObject } from 'fabric';
import type { RichShapeGroup } from '../../objects/rich-shape';
import { isTextbox } from '../core/helpers';

export interface HiddenTextObject {
  object: FabricObject;
  visible: boolean;
}

export function hideShapeTextObjects(object: RichShapeGroup): HiddenTextObject[] {
  const hiddenTextObjects = object
    .getObjects()
    .filter(isTextbox)
    .map((child) => ({
      object: child,
      visible: child.visible !== false,
    }));
  hiddenTextObjects.forEach(({ object: child }) => child.set({ visible: false }));
  return hiddenTextObjects;
}

export function restoreShapeTextObjects(hiddenTextObjects: readonly HiddenTextObject[]): void {
  hiddenTextObjects.forEach(({ object, visible }) => object.set({ visible }));
}

export function registerOverlayRefreshHandlers(
  canvas: Canvas,
  refreshRichShapeTextEditor: () => void
): () => void {
  document.addEventListener('scroll', refreshRichShapeTextEditor, true);
  window.addEventListener('resize', refreshRichShapeTextEditor);
  canvas.on('after:render', refreshRichShapeTextEditor);

  return () => {
    document.removeEventListener('scroll', refreshRichShapeTextEditor, true);
    window.removeEventListener('resize', refreshRichShapeTextEditor);
    canvas.off('after:render', refreshRichShapeTextEditor);
  };
}
