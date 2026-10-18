import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { resolveEditorWindowHeader } from '../../features/editor/document/constants';
import { FabricImage, type FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../features/editor/document/types';
import { renderExactBrowserFrameToDataUrl } from '../browser-frame/factory/exact/renderer';
import { createObjectLabel, getFabricImageIntrinsicSize } from '../document/model';

interface BrowserFrameLayerObjectParams {
  browserFrame: BrowserFrameState;
  existingObject?: FabricObject | null;
  left: number;
  nextLabelIndex: number;
  prepareObject: (object: FabricObject) => void;
  top: number;
  width: number;
  sourceHeight?: number;
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
  const sourceHeight = options.sourceHeight ?? width;
  const headerHeight = windowHeaderGeometry(resolveEditorWindowHeader(options.browserFrame), {
    width,
    height: sourceHeight,
  }).height;
  const dataUrl = await renderExactBrowserFrameToDataUrl({
    browserFrame: options.browserFrame,
    height: headerHeight,
    headerHeight,
    sourceHeight,
    radius: 0,
    width,
  });
  const image = await FabricImage.fromURL(dataUrl);
  const intrinsicSize = getFabricImageIntrinsicSize(image);

  image.set({
    left: options.left,
    top: options.top,
    scaleX: width / intrinsicSize.width,
    scaleY: headerHeight / intrinsicSize.height,
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
