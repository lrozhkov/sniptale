import { FabricImage, type FabricObject } from 'fabric';
import type { BrowserFrameDecorationObjects, FrameOptions } from './types';
import { getFabricImageIntrinsicSize } from '../../document/model';
import { resolveBrowserFrameMockupLayout } from './layout';
import { renderExactBrowserFrameToDataUrl } from './exact/renderer';

function configureBrowserMockupObject(object: FabricObject): void {
  object.set({
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    objectCaching: false,
    id: 'browser-frame-mockup',
    excludeFromExport: true,
  });
  object.sniptaleRole = 'browser-frame';
  object.sniptaleType = 'browser-frame';
}

function createSourceClipPath(options: FrameOptions): FabricObject | null {
  void options;
  return null;
}

async function createBrowserMockupImage(options: FrameOptions): Promise<FabricObject> {
  const layout = resolveBrowserFrameMockupLayout(options);
  const renderOptions = {
    browserFrame: options.browserFrame,
    height: layout.chrome.height,
    headerHeight: layout.headerHeight,
    radius: layout.radius,
    width: layout.chrome.width,
  };
  const dataUrl = await renderExactBrowserFrameToDataUrl(renderOptions);
  const image = await FabricImage.fromURL(dataUrl);
  const intrinsicSize = getFabricImageIntrinsicSize(image);

  image.set({
    left: layout.chrome.left,
    top: layout.chrome.top,
    scaleX: layout.chrome.width / intrinsicSize.width,
    scaleY: layout.chrome.height / intrinsicSize.height,
  });
  configureBrowserMockupObject(image);
  image.setCoords();
  return image;
}

export async function createBrowserFrameDecorationObjects(
  options: FrameOptions
): Promise<BrowserFrameDecorationObjects> {
  const mockup = await createBrowserMockupImage(options);

  return {
    objects: [mockup],
    sourceClipPath: createSourceClipPath(options),
  };
}
