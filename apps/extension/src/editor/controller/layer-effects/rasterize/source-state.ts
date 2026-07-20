import { FabricImage, type FabricObject } from 'fabric';
import { isSourceObject } from '../../../document/model';
import type { SourceState } from '../../../document/model/source-state';

export function buildRasterizedSourceState(
  source: SourceState | null,
  object: FabricObject
): SourceState | null {
  if (!source || !isSourceObject(object)) {
    return source;
  }

  const dataUrl = object.toDataURL({ format: 'png' });
  const nextWidth = Math.max(1, Math.round(object.getScaledWidth()));
  const nextHeight = Math.max(1, Math.round(object.getScaledHeight()));
  const intrinsic = isFabricImageObject(object) ? getRasterImageIntrinsicSize(object) : null;

  return {
    ...source,
    dataUrl,
    displayHeight: nextHeight,
    displayWidth: nextWidth,
    id: object.sniptaleId ?? source.id,
    intrinsicHeight: intrinsic?.height ?? nextHeight,
    intrinsicWidth: intrinsic?.width ?? nextWidth,
    left: object.left ?? source.left,
    locked: Boolean(object.sniptaleLocked),
    name: object.sniptaleLabel ?? source.name,
    top: object.top ?? source.top,
    visible: object.visible !== false,
  };
}

function isFabricImageObject(object: FabricObject): object is FabricImage {
  return object instanceof FabricImage;
}

function getRasterImageIntrinsicSize(image: FabricImage): { width: number; height: number } {
  const element = image.getElement();
  const width =
    (element instanceof HTMLImageElement ? element.naturalWidth : 0) ||
    element?.width ||
    image.width;
  const height =
    (element instanceof HTMLImageElement ? element.naturalHeight : 0) ||
    element?.height ||
    image.height;

  return {
    height: Math.max(1, Math.round(height ?? 0)),
    width: Math.max(1, Math.round(width ?? 0)),
  };
}
