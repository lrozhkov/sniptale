import { FabricImage, type FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../features/editor/document/types';
import { renderExactBrowserFrameToDataUrl } from '../browser-frame/factory/exact/renderer';
import {
  BROWSER_HEADER_HEIGHT,
  createObjectLabel,
  getFabricImageIntrinsicSize,
} from '../document/model';

interface BrowserFrameLayerObjectParams {
  browserFrame: BrowserFrameState;
  existingObject?: FabricObject | null;
  left: number;
  nextLabelIndex: number;
  prepareObject: (object: FabricObject) => void;
  top: number;
  width: number;
}

function configureBrowserFrameLayer(object: FabricObject): void {
  object.set({
    originX: 'left',
    originY: 'top',
    objectCaching: false,
  });
  object.sniptaleRole = 'annotation';
  object.sniptaleType = 'browser-frame';
}

function preserveBrowserFrameLayerState(
  next: FabricObject,
  previous: FabricObject | null | undefined,
  nextLabelIndex: number
): void {
  next.sniptaleId = previous?.sniptaleId ?? crypto.randomUUID();
  next.sniptaleLabel =
    previous?.sniptaleLabel ?? createObjectLabel('browser-frame', nextLabelIndex);
  next.sniptaleLocked = previous?.sniptaleLocked ?? false;
  next.visible = previous?.visible ?? true;
}

export async function createBrowserFrameLayerObject(
  options: BrowserFrameLayerObjectParams
): Promise<FabricObject> {
  const width = Math.max(1, Math.round(options.width));
  const dataUrl = await renderExactBrowserFrameToDataUrl({
    browserFrame: options.browserFrame,
    height: BROWSER_HEADER_HEIGHT,
    headerHeight: BROWSER_HEADER_HEIGHT,
    radius: 0,
    width,
  });
  const image = await FabricImage.fromURL(dataUrl);
  const intrinsicSize = getFabricImageIntrinsicSize(image);

  image.set({
    left: options.left,
    top: options.top,
    scaleX: width / intrinsicSize.width,
    scaleY: BROWSER_HEADER_HEIGHT / intrinsicSize.height,
  });
  configureBrowserFrameLayer(image);
  preserveBrowserFrameLayerState(image, options.existingObject, options.nextLabelIndex);
  options.prepareObject(image);
  image.setCoords();
  return image;
}

export async function createBrowserFrameObjects(_params?: unknown): Promise<FabricObject[]> {
  return [];
}
