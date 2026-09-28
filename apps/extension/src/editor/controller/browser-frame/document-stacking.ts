import { FabricImage, type Canvas } from 'fabric';
import { BROWSER_HEADER_HEIGHT } from '../../document/model';
import { getSourceObject } from '../document/layers';
import { attachBrowserHeaderToImage } from '../../objects/image-frame';
import { findBrowserFrameHeader } from '../tools/decorations';

export function ensureEditorBrowserFrameOnTop(canvas: Canvas | null): void {
  if (!canvas) {
    return;
  }

  const header = findBrowserFrameHeader(canvas);
  const source = getSourceObject(canvas);
  if (!source) {
    return;
  }

  if (!header) {
    attachBrowserHeaderToImage(source, null, 0);
    canvas.requestRenderAll();
    return;
  }

  const element = header instanceof FabricImage ? header.getElement() : null;
  attachBrowserHeaderToImage(source, element, BROWSER_HEADER_HEIGHT);
  header.set({ visible: false, selectable: false, evented: false });
  if (canvas.getActiveObjects().includes(header)) canvas.discardActiveObject();
  const sourceIndex = canvas.getObjects().indexOf(source);
  if (sourceIndex >= 0) canvas.moveObjectTo(header, sourceIndex + 1);
  header.setCoords();
  canvas.requestRenderAll();
}
