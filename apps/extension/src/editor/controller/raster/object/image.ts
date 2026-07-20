import { FabricImage, type FabricObject } from 'fabric';
import { applyImageSettings, readImageSettingsFromObject } from '../../../objects/image-style';
import { canvasToRasterDataUrl } from '../bitmap';
import { copyRasterReplacementMetadata } from './metadata';
import { getReplacementScale } from './scale';
import type { RasterReplacementType } from './type';

export async function createReplacementImage(
  bitmap: HTMLCanvasElement,
  source: FabricObject,
  type: RasterReplacementType
): Promise<FabricImage> {
  const image = await FabricImage.fromURL(canvasToRasterDataUrl(bitmap));
  image.set({
    left: source.left ?? 0,
    top: source.top ?? 0,
    originX: source.originX,
    originY: source.originY,
    scaleX: getReplacementScale(source, bitmap, 'x'),
    scaleY: getReplacementScale(source, bitmap, 'y'),
    angle: source.angle ?? 0,
    flipX: Boolean(source.flipX),
    flipY: Boolean(source.flipY),
    skewX: source.skewX ?? 0,
    skewY: source.skewY ?? 0,
    opacity: source.opacity ?? 1,
    visible: source.visible !== false,
  });
  image.sniptaleId = source.sniptaleId ?? crypto.randomUUID();
  image.sniptaleLabel = source.sniptaleLabel ?? 'Layer';
  image.sniptaleLocked = Boolean(source.sniptaleLocked);
  image.sniptaleRole =
    type === 'source-image' ? 'source' : type === 'background' ? 'background' : 'annotation';
  image.sniptaleType = type;
  image.sniptaleEffects = [];
  copyRasterReplacementMetadata(image, source);
  applyImageSettings(image, readImageSettingsFromObject(source));
  image.setCoords();
  return image;
}
